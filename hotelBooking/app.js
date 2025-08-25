import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { v4 as uuid4 } from 'uuid';
import { error } from 'console';
import exp from 'constants';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();
const { Pool } = pg;

const app = express();
const port = 3000;

app.use(express.json());

const _filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(_filename);

//postgres connection pool
const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false, // required on Render
  },
  max: 20, //maximum number of client in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// JWT secret (use enviroment variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'theNewKeyGenerator'; // replace with secrete

//middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extend: true }));

app.use(express.static(path.join(__dirname, '../public')));

const initializeDatabase = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
            CREATE EXTENSION IF NOT EXISTS "pgcrypto"
            `);
    // Create rooms table
    await client.query(`
            CREATE TABLE IF NOT EXISTS rooms(
            room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            room_number VARCHAR(10) NOT NULL,
            room_type VARCHAR(50) NOT NULL,
            capacity INTEGER NOT NULL,
            price_per_night DECIMAL(10,2) NOT NULL,
            amenities TEXT,
            status VARCHAR(20) DEFAULT 'available',
            images BYTEA NOT NULL 
            )
            `);

    // create reservations table
    await client.query(`
            CREATE TABLE IF NOT EXISTS reservations(
            reservation_id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
            room_id UUID NOT NULL REFERENCES rooms(room_id),
            guest_name VARCHAR(100) NOT NULL,
            guest_email VARCHAR(100),
            guest_phone VARCHAR(20) NOT NULL,
            check_in_date DATE NOT NULL,
            check_out_date DATE NOT NULL,
            guest_count INTEGER NOT NULL,
            total_amount DECIMAL(10,2) NOT NULL,
            payment_status VARCHAR(20) DEFAULT 'confirmed',
            reservation_status VARCHAR(20) DEFAULT 'confirmed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            `);

    // create payment table
    await client.query(`
            CREATE TABLE IF NOT EXISTS payments(
            payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
            reservation_id UUID NOT NULL REFERENCES reservations(reservation_id),
            amount DECIMAL(10,2) NOT NULL,
            payment_method VARCHAR(50) NOT NULL,
            payment_status VARCHAR(20) DEFAULT 'pending',
            transactionId VARCHAR(100),
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);

    // Create discount table
    await client.query(`
            CREATE TABLE IF NOT EXISTS discount(
            discount_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            room_id UUID NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
            discount_type VARCHAR(50) NOT NULL CHECK(discount_type IN('percentage', 'fixed')),
            discount_value NUMERIC  NOT NULL CHECK (discount_value > 0),
            promo_code VARCHAR(50),
            start_date TIMESTAMP NOT NULL,
            end_date TIMESTAMP NOT NULL,
            status BOOLEAN DEFAULT true 
            )
            `);

    //create indexes for better performance
    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations("check_in_date","check_out_date")
            `);

    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reservations_room_id
            ON reservations("room_id")
            `);

    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_reservation_id 
            ON payments("reservation_id")`);

    //check if room exist, if not insert sample data
    const roomResult = await client.query('SELECT COUNT(*) FROM rooms');
    const roomCount = parseInt(roomResult.rows[0].count);

    if (roomCount === 0) {
      const sampleRooms = [
        [
          101,
          'standard Single',
          1,
          89.99,
          'Wifi,AC, TV, Mini bar',
          'x48656c6c6f',
        ],
        [
          102,
          'standard Double',
          2,
          129.99,
          'Wifi,AC, TV, Mini bar',
          'x48656c6846f',
        ],
        [
          103,
          'Deluxe Suite',
          4,
          199.99,
          'Wifi,AC, TV, Mini bar,Balcony, Jacuzzi',
          'x48656c6846f',
        ],
        [
          201,
          'standard Single',
          1,
          89.99,
          'Wifi,AC, TV, Mini bar',
          'x48656c68hr',
        ],
        [
          202,
          'standard Doube',
          2,
          89.99,
          'Wifi,AC, TV, Mini bar',
          'x656c6846f',
        ],
        [
          203,
          'family Room',
          6,
          249.99,
          'Wifi,AC, TV, Mini bar, Kitchen',
          'x48656c68f',
        ],
      ];

      for (const room of sampleRooms) {
        await client.query(
          `INSERT INTO rooms ("room_number", "room_type", capacity,"price_per_night", amenities,images)
                    VALUES($1, $2,$3, $4,$5,$6)`,
          room
        );
      }
    }

    await client.query('COMMIT');
    console.log('Database initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
};

// utility functions
const calculateNights = (checkIn, checkOut) => {
  const start_date = new Date(checkIn);
  const end_date = new Date(checkOut);
  return Math.ceil((end_date - start_date) / (1000 * 60 * 60 * 24));
};

const isDateRangeAvailable = async (
  room_id,
  checkIn,
  checkOut,
  excludeReservationId = null
) => {
  try {
    let query = `
            SELECT COUNT(*) AS cnt
            FROM reservations
            WHERE room_id = $1
              AND reservation_status != 'cancelled'
              AND check_in_date < $2
              AND check_out_date > $3
        `;

    const params = [room_id, checkOut, checkIn];

    if (excludeReservationId) {
      query += ' AND reservation_id <> $4';
      params.push(excludeReservationId);
    }

    const result = await pool.query(query, params);

    console.log('Overlapping reservations count:', result.rows[0].cnt); // debug

    // Convert string count to number before comparison
    return Number(result.rows[0].cnt) === 0;
  } catch (err) {
    console.error('Error checking date availability:', err);
    throw err;
  }
};

//API Routes

app.post('/api/discount', async (req, res) => {
  const {
    room_type,
    discount_type,
    discount_value,
    promo_code,
    start_date,
    end_date,
    status = true,
  } = req.body;

  if (
    !room_type ||
    !discount_type ||
    !discount_value ||
    !promo_code ||
    !start_date ||
    !end_date
  ) {
    return res.status(400).json({ error: 'Field are required' });
  }

  const result = await pool.query(
    'SELECT * FROM rooms WHERE room_type = $1 LIMIT 1',
    [room_type]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const room_id = result.rows[0].room_id;
  const client = await pool.connect();

  try {
    const client = pool.connect();
    await client
      .query(
        `
    INSERT INTO discount(
    room_id,
    discount_type, 
    discount_value,
    promo_code,
    start_date,
    end_date,
    status
    ) VALUES ($1, $2,$3,$4,$5,$6, $7)
    `,
        [
          room_id,
          discount_type,
          discount_value,
          promo_code,
          start_date,
          end_date,
          status,
        ]
      )(await client)
      .query('COMMIT');
    res.status(201).json({
      success: true,
      message: 'Discount created successfully',
      discountDetaials: {
        discount_id: discount_id,
        room_id: room_id,
        discount_type: discount_type,
        discount_value: discount_value,
        promo_code: promo_code,
        start_date: start_date,
        end_date: end_date,
        status: status,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to create discount');
  }
});

app.get('/api/rooms', async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT 
                r.*,
                json_agg(
                    json_build_object(
                        'check_in_date', res.check_in_date,
                        'check_out_date', res.check_out_date
                    )
                ) FILTER (WHERE res.reservation_id IS NOT NULL) AS booked_dates
            FROM rooms r
            LEFT JOIN reservations res
                ON r.room_id = res.room_id
            GROUP BY r.room_id
            ORDER BY r.room_number
        `);

    res.json({ rooms: result.rows });
  } catch (err) {
    console.error('Error fetching rooms: ', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

//search available rooms
app.get('/api/rooms/search', async (req, res) => {
  const { checkIn, checkOut, guests } = req.query;

  if (!checkIn || !checkOut || !guests) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (new Date(checkIn) >= new Date(checkOut)) {
    return res
      .status(400)
      .json({ error: 'Check-out date must be after check-in date' });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM rooms WHERE capacity >= $1 AND status = 'available'",
      [guests]
    );

    const nights = calculateNights(checkIn, checkOut); // Calculate nights here
    const availableRooms = [];

    for (const room of result.rows) {
      const isAvailable = await isDateRangeAvailable(
        room.room_id,
        checkIn,
        checkOut
      );
      if (isAvailable) {
        availableRooms.push({
          ...room,
          totalPrice: (room.price_per_night * nights).toFixed(2),
          nights: nights,
        });
      }
    }

    res.json({
      rooms: availableRooms,
      searchParams: { checkIn, checkOut, guests },
    });
  } catch (err) {
    console.error('ERROR searching rooms: ', err);
    res.status(500).json({ error: 'Failed to search rooms' });
  }
});

//create room
app.post('/api/rooms', async (req, res) => {
  s;
  const {
    room_number,
    room_type,
    capacity,
    price_per_night,
    amenities,
    status = 'available',
    images,
  } = req.body;

  if (
    !room_number ||
    !room_type ||
    !capacity ||
    capacity < 0 ||
    !price_per_night ||
    price_per_night < 0 ||
    !amenities
  ) {
    return res.status(400).json({ error: ' Missing fields are required' });
  }

  if (!Array.isArray(images)) {
    return res.status(400).json({ error: 'image should be an array object' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const createRoom = await client.query(
      "SELECT * rooms WHERE 'room_type' = $1 LIMIT 1",
      [room_type]
    );

    if (createRoom.rows.length === 1) {
      return res.status(409).json({ error: 'Room Type already exist' });
    }

    await client.query(
      `INSERT INTO rooms (
        room_number,
        room_type,
        capacity,
        price_per_night, 
        amenities,
        status,
        images
        ) VALUES ($1, $2, $3, $4, $5,$6, $7) 
        `,
      [
        room_number,
        room_type,
        capacity,
        price_per_night,
        amenities,
        status,
        images,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: 'Room created Successfully',
      roomDetails: {
        room_id: room.room_id,
        room_number: room.room_number,
        room_type: room.room_type,
        capacity: room.capacity,
        price_per_night: room.price_per_night,
        amenities: room.amenities,
        status: room.status,
        images: room.images,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating room', err);
    res.status(500).json({ error: ' Failed to creating room' });
  }
});

// get room by id
app.get('/api/rooms/:id/', async (req, res) => {
  const roomid = req.params.id;

  try {
    const roomResult = await pool.query(
      'SELECT * FROM rooms WHERE room_id = $1',
      [roomid]
    );
    if (!roomResult) {
      return res.status(404).json({ error: 'Room with ID not found' });
    }

    const room = roomResult.rows[0];

    res.json({
      success: true,
      message: 'Room found with details',
      roomDetails: {
        roomid: room.room_id,
        roomNumber: room.room_number,
        roomType: room.room_type,
        capacity: room.capacity,
        pricePerNight: room.price_per_night,
        amenities: room.amenities,
        status: room.status,
        image: room.images,
      },
    });
  } catch (err) {
    console.error('error getting room via ID');
    res.status(500).json({ error: 'Failed to creating room' });
  }
});

// create reservation
app.post('/api/reservations/', async (req, res) => {
  const {
    room_id,
    room_type,
    guestName,
    guestEmail,
    guestPhone,
    checkInDate,
    checkOutDate,
    guestCount,
  } = req.body;

  if (!room_id) {
    return res.status(400).json({ error: 'room_id is required' });
  }
  if (!room_type) {
    return res.status(400).json({ error: 'room_type is required' });
  }
  if (!guestCount) {
    return res.status(400).json({ error: 'Number of guests is required' });
  }
  if (!guestName) {
    return res.status(400).json({ error: 'Guest name is required' });
  }
  if (!guestPhone) {
    return res.status(400).json({ error: 'Guest phone is required' });
  }
  if (!checkInDate) {
    return res.status(400).json({ error: 'Check-in date is required' });
  }
  if (!checkOutDate) {
    return res.status(400).json({ error: 'Check-out date is required' });
  }
  if (new Date(checkInDate) >= new Date(checkOutDate)) {
    return res
      .status(400)
      .json({ error: 'Check-out date must be after check-in date' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lookup room by room_id
    const roomResult = await client.query(
      'SELECT * FROM rooms WHERE room_id = $1 LIMIT 1',
      [room_id]
    );

    if (roomResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = roomResult.rows[0];

    if (guestCount > room.capacity) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: 'Guest count exceeds room capacity' });
    }

    const isAvailable = await isDateRangeAvailable(
      room.room_id,
      checkInDate,
      checkOutDate
    );

    if (!isAvailable) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: 'Room not available for selected date' });
    }

    const nights = calculateNights(checkInDate, checkOutDate);
    const totalAmount = (room.price_per_night * nights).toFixed(2);

    // Generate reservation_id
    const reservation_id = uuid4();

    const result = await client.query(
      `
        INSERT INTO reservations (
          reservation_id,
          room_id,
          guest_name,
          guest_email,
          guest_phone,
          check_in_date, 
          check_out_date,
          guest_count,
          total_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `,
      [
        reservation_id,
        room.room_id,
        guestName,
        guestEmail,
        guestPhone,
        checkInDate,
        checkOutDate,
        guestCount,
        totalAmount,
      ]
    );

    await client.query('COMMIT');
    console.log('Inserted reservation id', result.rows[0].reservation_id);

    res.status(201).json({
      success: true,
      message: 'Reservation created successfully',
      reservation: {
        reservationId: result.rows[0].reservation_id,
        room_number: room.room_number,
        room_type: room.room_type,
        guestName,
        checkInDate,
        checkOutDate,
        totalAmount,
        nights,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating reservation: ', err);
    res.status(500).json({ error: 'Failed to create reservation' });
  } finally {
    client.release();
  }
});

//get reseravtion details
app.get('/api/reservations/:id', async (req, res) => {
  const reservationId = req.params.id;

  try {
    const result = await pool.query(
      `
            SELECT r.*, rm.room_number, rm.room_type, rm.amenities
            FROM reservations r
            JOIN rooms rm ON r.room_id = rm.room_id
            WHERE r.reservations_id = $1
            `,
      [reservationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    res.status(201).json({ reservation: result.rows[0] });
  } catch (err) {
    console.error('Error fetching reservation: ', err);
    res.status(500).json({ error: 'Failed to fetch reservation' });
  }
});

// GET all reservations
app.get('/api/reservations', async (req, res) => {
  try {
    const reservations = await pool.query(`
        SELECT 
          r.reservations_id,
          r.guest_name,
          r.guest_email,
          r.guest_phone,
          r.check_in_date,
          r.check_out_date,
          r.guest_count,
          r.total_amount,
          rm.room_id,
          rm.room_number,
          rm.room_type
        FROM reservations r
        JOIN rooms rm ON r.room_id = rm.room_id
        ORDER BY r.check_in_date DESC
      `);

    res.json(reservations.rows);
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// process payment
app.post('/api/payments', async (req, res) => {
  const { reservationId, payment_method, cardNumber, cardExpiry, cardCvv } =
    req.body;

  if (!reservationId || !payment_method) {
    return res
      .status(400)
      .json({ error: 'Missing required payment information' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const reservationResult = await client.query(
      'SELECT * FROM reservations WHERE reservation_id = $1',
      [reservationId]
    );

    if (reservationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = reservationResult.rows[0];

    if (reservation.paymentStatus === 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payment already processed' });
    }

    const paymentId = uuid4();
    const transactionId = `TXN_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    const paymentSuccess = Math.random() > 0.1;

    if (paymentSuccess) {
      await client.query(
        `
              INSERT INTO payments (
                payment_id,
                reservation_id,
                amount,
                payment_method,
                payment_status, transaction_id) VALUES ($1, $2, $3, $4,"completed", $5)`,
        [
          paymentId,
          reservationId,
          reservation.totalAmount,
          payment_method,
          transactionId,
        ]
      );

      //Update reservation payment status
      await client.query(
        "UPDATE reservations SET paymentStatus = 'paid' WHERE reservation_id = $1",
        [reservationId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Payment processed successfully',
        payment: {
          paymentId: paymentId,
          transactionId: transactionId,
          amount: reservation.totalAmount,
          status: 'completed',
        },
      });
    } else {
      await client.query(
        `
                INSERT INTO payments(
                payment_id, 
                reservation_id, 
                amount, 
                payment_method,
                payment_status,
                transaction_id) VALUES($1, $2,$3, $4,'failed', $5)`,
        [
          paymentId,
          reservationId,
          reservation.totalAmount,
          payment_method,
          transactionId,
        ]
      );

      await client.query('COMMIT');

      res.status(400).json({
        success: false,
        message: 'Paymennt failed. Please try again',
        error: 'payment declained by bank',
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error processing payment: ', err);
    res.status(500).json({ error: 'Failed to process payment' });
  } finally {
    client.release();
  }
});

//cancelling reservation
app.delete('/api/reservations/:id', async (req, res) => {
  const reservationsId = req.params.id;

  try {
    const checkResult = await pool.query(
      'SELECT * FROM reservations WHERE reservations_id= $1',
      [reservationsId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = checkResult.rows[0];

    if (reservation.reservation_status === 'cancelled') {
      return res.status(400).json({ error: 'Reservation already cancelled' });
    }

    await pool.query(
      "UPDATE reservations SET reservation_status = 'cancelled' WHERE reservations_id = $1",
      [reservationsId]
    );

    res.json({
      success: true,
      message: 'Reservation cancelled successfully',
    });
  } catch (err) {
    console.error('Error cancelling reservation:', err);
    res.status(500).json({ error: 'Failed to cancel reservation' });
  }
});

//Get all reservations (admin endpoint)
app.get('/api/admin/reservations', async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT r.*, rm.room_number, rm.room_type
            FROM reservations r
            JOIN rooms rm ON r.room_id = rm.room_id
            ORDER BY r.created_at DESC
            `);

    res.json({ reservations: result.rows });
  } catch (err) {
    console.error('Error fetching resservations: ', err);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

//Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

//Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Endpoint not found' });
});

//Graceful shutdown
const gracefulshutdown = () => {
  console.log('Shutting down Gracefully......');
  pool.end(() => {
    console.log('PostgreSQL pool has ended');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulshutdown);
process.on('SIGTERM', gracefulshutdown);

const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(port, () => {
      console.log(`Hotel booking server running at http://localhost:${port}`);
      console.log(`Database initialized with sample rooms`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

export default app;
