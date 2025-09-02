import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { v4 as uuid4 } from 'uuid';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { initializePayment, verifyPayment } from './services/paystack.js';

// Define __filename and __dirname at the top
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const { Pool } = pg;

const app = express();
const port = 3000;

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'theNewKeyGenerator';

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: [
      'https://ggbghana.com/',
      'https://staff.ggbghana.com/',
      'https://ggbghanaa.netlify.app/',
      'https://gye-nyame-hotel-backend-neqd.onrender.com',
    ], // Allow both origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Multer configuration for multiple image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'Uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
});

// Postgres connection pool with SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false,
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Initialize database
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
        images BYTEA[] NOT NULL
      )
    `);

    // Create reservations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reservations(
        reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

    // Create payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments(
        payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id UUID NOT NULL REFERENCES reservations(reservation_id),
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        payment_status VARCHAR(20) DEFAULT 'pending',
        transaction_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create discount table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discount(
        discount_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
        discount_type VARCHAR(50) NOT NULL CHECK(discount_type IN('percentage', 'fixed')),
        discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
        promo_code VARCHAR(50),
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        status BOOLEAN DEFAULT true
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(check_in_date, check_out_date)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_room_id ON reservations(room_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_reservation_id ON payments(reservation_id)
    `);

    // Check and rename transactionid to transaction_id if necessary
    const transactionColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'payments' AND column_name = 'transactionid'
    `);
    if (transactionColumns.rows.length > 0) {
      await client.query(
        'ALTER TABLE payments RENAME COLUMN transactionid TO transaction_id'
      );
      console.log('Renamed payments.transactionid to payments.transaction_id');
    }

    // Check and rename createdat to created_at if necessary
    const createdAtColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'payments' AND column_name = 'createdat'
    `);
    if (createdAtColumns.rows.length > 0) {
      await client.query(
        'ALTER TABLE payments RENAME COLUMN createdat TO created_at'
      );
      console.log('Renamed payments.createdat to payments.created_at');
    }

    // Insert sample admin user if none exist
    const userResult = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userResult.rows[0].count) === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['admin', 'admin@hotel.com', hashedPassword, 'admin']
      );
    }

    // Insert sample rooms if none exist
    const roomResult = await pool.query('SELECT COUNT(*) FROM rooms');
    if (parseInt(roomResult.rows[0].count) === 0) {
      const sampleRooms = [
        {
          room_number: '101',
          room_type: 'Standard Single',
          capacity: 1,
          price_per_night: 89.99,
          amenities: 'WiFi, AC, TV, Mini bar',
          images: ['\\x48656c6c6f'],
        },
        {
          room_number: '102',
          room_type: 'Standard Double',
          capacity: 2,
          price_per_night: 129.99,
          amenities: 'WiFi, AC, TV, Mini bar',
          images: ['\\x48656c6846f'],
        },
        {
          room_number: '103',
          room_type: 'Deluxe Suite',
          capacity: 4,
          price_per_night: 199.99,
          amenities: 'WiFi, AC, TV, Mini bar, Balcony, Jacuzzi',
          images: ['\\x48656c6846f'],
        },
        {
          room_number: '201',
          room_type: 'Standard Single 2',
          capacity: 1,
          price_per_night: 89.99,
          amenities: 'WiFi, AC, TV, Mini bar',
          images: ['\\x48656c68hr'],
        },
        {
          room_number: '202',
          room_type: 'Standard Double 2',
          capacity: 2,
          price_per_night: 89.99,
          amenities: 'WiFi, AC, TV, Mini bar',
          images: ['\\x656c6846f'],
        },
        {
          room_number: '203',
          room_type: 'Family Room',
          capacity: 6,
          price_per_night: 249.99,
          amenities: 'WiFi, AC, TV, Mini bar, Kitchen',
          images: ['\\x48656c68f'],
        },
      ];
      for (const room of sampleRooms) {
        await client.query(
          `INSERT INTO rooms (room_number, room_type, capacity, price_per_night, amenities, images)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            room.room_number,
            room.room_type,
            room.capacity,
            room.price_per_night,
            room.amenities,
            room.images,
          ]
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

// Utility functions
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
    return Number(result.rows[0].cnt) === 0;
  } catch (err) {
    console.error('Error checking date availability:', err);
    throw err;
  }
};

// Authentication endpoints
app.post('/api/auth/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id, username, email',
      [username, email, hashedPassword, 'admin']
    );
    res
      .status(201)
      .json({ message: 'User created successfully', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res
        .status(400)
        .json({ error: 'Username or email already exists' });
    }
    console.error('Error creating user:', err);
    res
      .status(500)
      .json({ error: 'Failed to create user', details: err.message });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [
      email,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { userId: user.user_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({
      token,
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Error signing in:', err);
    res.status(500).json({ error: 'Failed to sign in', details: err.message });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ user: req.user, message: 'Token is valid' });
});

// API Routes
app.post('/api/discount', authenticateToken, async (req, res) => {
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
    return res.status(400).json({ error: 'All fields are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT * FROM rooms WHERE room_type = $1 LIMIT 1',
      [room_type]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Room not found' });
    }
    const room_id = result.rows[0].room_id;
    const discountResult = await client.query(
      `INSERT INTO discount (
        room_id, discount_type, discount_value, promo_code, start_date, end_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING discount_id`,
      [
        room_id,
        discount_type,
        discount_value,
        promo_code,
        start_date,
        end_date,
        status,
      ]
    );
    const discount_id = discountResult.rows[0].discount_id;
    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: 'Discount created successfully',
      discountDetails: {
        discount_id,
        room_id,
        discount_type,
        discount_value,
        promo_code,
        start_date,
        end_date,
        status,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to create discount:', err.message, err.stack);
    res
      .status(500)
      .json({ error: 'Failed to create discount', details: err.message });
  } finally {
    client.release();
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
      LEFT JOIN reservations res ON r.room_id = res.room_id
      GROUP BY r.room_id
      ORDER BY r.room_number
    `);
    const rooms = result.rows.map((room) => ({
      ...room,
      image_count: room.images ? room.images.length : 0,
      image_urls: Array.from(
        { length: room.images ? room.images.length : 0 },
        (_, i) =>
          `https://gye-nyame-hotel-backend-neqd.onrender.com/api/rooms/${room.room_id}/images/${i}`
      ),
    }));
    res.json({ rooms });
  } catch (err) {
    console.error('Error fetching rooms:', err.message, err.stack);
    res
      .status(500)
      .json({ error: 'Failed to fetch rooms', details: err.message });
  }
});

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
    const nights = calculateNights(checkIn, checkOut);
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
          nights,
        });
      }
    }
    res.json({
      rooms: availableRooms,
      searchParams: { checkIn, checkOut, guests },
    });
  } catch (err) {
    console.error('Error searching rooms:', err.message, err.stack);
    res
      .status(500)
      .json({ error: 'Failed to search rooms', details: err.message });
  }
});

app.post(
  '/api/rooms',
  authenticateToken,
  upload.array('images', 5),
  async (req, res) => {
    const {
      room_number,
      room_type,
      capacity,
      price_per_night,
      amenities,
      status = 'available',
    } = req.body;
    if (
      !room_number ||
      !room_type ||
      !capacity ||
      !price_per_night ||
      !amenities ||
      !req.files ||
      req.files.length === 0
    ) {
      return res
        .status(400)
        .json({ error: 'All fields and at least one image are required' });
    }
    if (isNaN(capacity) || capacity <= 0) {
      return res
        .status(400)
        .json({ error: 'Capacity must be a positive number' });
    }
    if (isNaN(price_per_night) || price_per_night <= 0) {
      return res
        .status(400)
        .json({ error: 'Price per night must be a positive number' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const checkRoom = await client.query(
        'SELECT * FROM rooms WHERE LOWER(room_type) = LOWER($1) LIMIT 1',
        [room_type]
      );
      if (checkRoom.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Room type already exists' });
      }
      const imageBuffers = req.files.map((file) => fs.readFileSync(file.path));
      const result = await client.query(
        `INSERT INTO rooms (
        room_number, room_type, capacity, price_per_night, amenities, status, images
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
        [
          room_number,
          room_type,
          capacity,
          price_per_night,
          amenities,
          status,
          imageBuffers,
        ]
      );
      const newRoom = result.rows[0];
      await client.query('COMMIT');
      req.files.forEach((file) => fs.unlinkSync(file.path));
      res.status(201).json({
        success: true,
        message: 'Room created successfully',
        roomDetails: {
          room_id: newRoom.room_id,
          room_number: newRoom.room_number,
          room_type: newRoom.room_type,
          capacity: newRoom.capacity,
          price_per_night: newRoom.price_per_night,
          amenities: newRoom.amenities,
          status: newRoom.status,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error creating room:', err.message, err.stack);
      res
        .status(500)
        .json({ error: 'Failed to create room', details: err.message });
    } finally {
      client.release();
    }
  }
);

app.put(
  '/api/rooms/:id',
  authenticateToken,
  upload.array('images', 5),
  async (req, res) => {
    const { id } = req.params;
    const {
      room_number,
      room_type,
      capacity,
      price_per_night,
      amenities,
      status,
    } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'SELECT * FROM rooms WHERE room_id = $1',
        [id]
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Room not found' });
      }
      const imageBuffers =
        req.files.length > 0
          ? req.files.map((file) => fs.readFileSync(file.path))
          : result.rows[0].images;
      const updatedRoom = await client.query(
        `UPDATE rooms SET
        room_number = $1,
        room_type = $2,
        capacity = $3,
        price_per_night = $4,
        amenities = $5,
        status = $6,
        images = $7
       WHERE room_id = $8
       RETURNING *`,
        [
          room_number,
          room_type,
          capacity,
          price_per_night,
          amenities,
          status || 'available',
          imageBuffers,
          id,
        ]
      );
      await client.query('COMMIT');
      req.files.forEach((file) => fs.unlinkSync(file.path));
      res.json({
        success: true,
        message: 'Room updated successfully',
        roomDetails: updatedRoom.rows[0],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error updating room:', err);
      res
        .status(500)
        .json({ error: 'Failed to update room', details: err.message });
    } finally {
      client.release();
    }
  }
);

app.delete('/api/rooms/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM rooms WHERE room_id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json({ success: true, message: 'Room deleted successfully' });
  } catch (err) {
    console.error('Error deleting room:', err);
    res
      .status(500)
      .json({ error: 'Failed to delete room', details: err.message });
  }
});

app.get('/api/rooms/:id/images/:index', async (req, res) => {
  const { id, index } = req.params;
  console.log(`Fetching image for room ${id}, index ${index}`);
  try {
    const result = await pool.query(
      'SELECT images[$2] AS image FROM rooms WHERE room_id = $1 LIMIT 1',
      [id, parseInt(index, 10) + 1]
    );
    if (result.rows.length === 0 || !result.rows[0].image) {
      console.log(`No image found for room ${id}, index ${index}`);
      return res.status(404).json({ error: 'Image not found' });
    }
    const imageSize = Buffer.from(result.rows[0].image).length;
    console.log(
      `Image fetched for room ${id}, index ${index}, size: ${imageSize} bytes`
    );
    res.set('Content-Type', 'image/jpeg');
    res.send(result.rows[0].image);
  } catch (err) {
    console.error(
      `Error fetching image for room ${id}, index ${index}:`,
      err.message,
      err.stack
    );
    res
      .status(500)
      .json({ error: 'Failed to fetch image', details: err.message });
  }
});
app.get('/api/rooms/:id', async (req, res) => {
  const roomId = req.params.id;
  try {
    const roomResult = await pool.query(
      `SELECT 
         r.*,
         json_agg(
           json_build_object(
             'check_in_date', res.check_in_date,
             'check_out_date', res.check_out_date
           )
         ) FILTER (WHERE res.reservation_id IS NOT NULL) AS booked_dates
       FROM rooms r
       LEFT JOIN reservations res ON r.room_id = res.room_id
       WHERE r.room_id = $1
       GROUP BY r.room_id`,
      [roomId]
    );
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Room with ID not found' });
    }
    const room = roomResult.rows[0];
    const image_urls = Array.from(
      { length: room.images ? room.images.length : 0 },
      (_, i) =>
        `https://gye-nyame-hotel-backend-neqd.onrender.com/api/rooms/${room.room_id}/images/${i}`
    );
    res.json({
      success: true,
      message: 'Room found with details',
      roomDetails: {
        room_id: room.room_id,
        room_number: room.room_number,
        room_type: room.room_type,
        capacity: room.capacity,
        price_per_night: room.price_per_night,
        amenities: room.amenities,
        status: room.status,
        image_count: room.images ? room.images.length : 0,
        image_urls: image_urls,
        booked_dates: room.booked_dates || [],
      },
    });
  } catch (err) {
    console.error('Error fetching room by ID:', err.message, err.stack);
    res
      .status(500)
      .json({ error: 'Failed to fetch room', details: err.message });
  }
});
app.post('/api/reservations', async (req, res) => {
  const {
    room_id,
    room_type,
    guest_name,
    guest_email,
    guest_phone,
    check_in_date,
    check_out_date,
    guest_count,
  } = req.body;
  if (
    !room_id ||
    !room_type ||
    !guest_count ||
    !guest_name ||
    !guest_phone ||
    !check_in_date ||
    !check_out_date
  ) {
    return res
      .status(400)
      .json({ error: 'All required fields must be provided' });
  }
  if (new Date(check_in_date) >= new Date(check_out_date)) {
    return res
      .status(400)
      .json({ error: 'Check-out date must be after check-in date' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const roomResult = await pool.query(
      'SELECT * FROM rooms WHERE room_id = $1 AND room_type = $2 LIMIT 1',
      [room_id, room_type]
    );
    if (roomResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Room not found' });
    }
    const room = roomResult.rows[0];
    if (guest_count > room.capacity) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: 'Guest count exceeds room capacity' });
    }
    const isAvailable = await isDateRangeAvailable(
      room.room_id,
      check_in_date,
      check_out_date
    );
    if (!isAvailable) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: 'Room not available for selected dates' });
    }
    const nights = calculateNights(check_in_date, check_out_date);
    const total_amount = (room.price_per_night * nights).toFixed(2);
    const reservation_id = uuid4();
    const result = await client.query(
      `
        INSERT INTO reservations (
          reservation_id, room_id, guest_name, guest_email, guest_phone, check_in_date, check_out_date, guest_count, total_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `,
      [
        reservation_id,
        room.room_id,
        guest_name,
        guest_email,
        guest_phone,
        check_in_date,
        check_out_date,
        guest_count,
        total_amount,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: 'Reservation created successfully',
      reservation: {
        reservation_id: result.rows[0].reservation_id,
        room_number: room.room_number,
        room_type: room.room_type,
        guest_name,
        check_in_date,
        check_out_date,
        total_amount,
        nights,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating reservation:', err.message, err.stack);
    res
      .status(500)
      .json({ error: 'Failed to create reservation', details: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/reservations/:id', async (req, res) => {
  const reservation_id = req.params.id;
  try {
    const result = await pool.query(
      `
        SELECT r.*, rm.room_number, rm.room_type, rm.amenities
        FROM reservations r
        JOIN rooms rm ON r.room_id = rm.room_id
        WHERE r.reservation_id = $1
      `,
      [reservation_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    res.status(200).json({ reservation: result.rows[0] });
  } catch (err) {
    console.error('Error fetching reservation:', err.message, err.stack);
    res
      .status(500)
      .json({ error: 'Failed to fetch reservation', details: err.message });
  }
});

app.get('/api/reservations', async (req, res) => {
  try {
    const reservations = await pool.query(`
      SELECT 
        r.reservation_id, r.guest_name, r.guest_email, r.guest_phone, r.check_in_date, r.check_out_date, 
        r.guest_count, r.total_amount, rm.room_id, rm.room_number, rm.room_type
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.room_id
      ORDER BY r.check_in_date DESC
    `);
    res.json(reservations.rows);
  } catch (err) {
    console.error('Error fetching reservations:', err.message, err.stack);
    res
      .status(500)
      .json({ error: 'Failed to fetch reservations', details: err.message });
  }
});

// Process payment
app.post('/api/payments', async (req, res) => {
  const { email, amount, reservation_id, method } = req.body;
  if (!email || !amount || !reservation_id || !method) {
    return res.status(400).json({
      error: 'Email, amount, reservation_id, and method are required',
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  try {
    // Verify reservation exists
    const reservationResult = await pool.query(
      'SELECT * FROM reservations WHERE reservation_id = $1',
      [reservation_id]
    );
    if (reservationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    const payment = await initializePayment({ email, amount });
    await pool.query(
      `INSERT INTO payments (reservation_id, amount, payment_method, payment_status, transaction_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [reservation_id, amount, method, 'pending', payment.data.reference]
    );
    res.json({ authorization_url: payment.data.authorization_url });
  } catch (error) {
    console.error('Payment initialization error:', error.message, error.stack);
    res
      .status(500)
      .json({ error: 'Payment initialization failed', details: error.message });
  }
});

// Verify payment
app.get('/api/verify/:reference', async (req, res) => {
  const { reference } = req.params;
  try {
    // Verify payment record exists
    const paymentResult = await pool.query(
      'SELECT * FROM payments WHERE transaction_id = $1',
      [reference]
    );
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    const verification = await verifyPayment(reference);
    const status = verification.data.status;
    await pool.query(
      `UPDATE payments SET payment_status = $1 WHERE transaction_id = $2`,
      [status, reference]
    );
    res.json({ status, data: verification.data });
  } catch (error) {
    console.error('Payment verification error:', error.message, error.stack);
    res
      .status(500)
      .json({ error: 'Payment verification failed', details: error.message });
  }
});

app.delete('/api/reservations/:id', async (req, res) => {
  const reservation_id = req.params.id;
  try {
    const checkResult = await pool.query(
      'SELECT * FROM reservations WHERE reservation_id = $1',
      [reservation_id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    const reservation = checkResult.rows[0];
    if (reservation.reservation_status === 'cancelled') {
      return res.status(400).json({ error: 'Reservation already cancelled' });
    }
    await pool.query(
      "UPDATE reservations SET reservation_status = 'cancelled' WHERE reservation_id = $1",
      [reservation_id]
    );
    res.json({ success: true, message: 'Reservation cancelled successfully' });
  } catch (err) {
    console.error('Error cancelling reservation:', err.message, err.stack);
    res
      .status(500)
      .json({ error: 'Failed to cancel reservation', details: err.message });
  }
});

app.get('/api/admin/reservations', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, rm.room_number, rm.room_type
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.room_id
      ORDER BY r.created_at DESC
    `);
    res.json({ reservations: result.rows });
  } catch (err) {
    console.error('Error fetching reservations:', err.message, err.stack);
    res
      .status(500)
      .json({ error: 'Failed to fetch reservations', details: err.message });
  }
});

app.get('/api/admin/payments', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.payment_id, p.reservation_id, p.amount, p.payment_method, p.payment_status, 
        p.transaction_id, p.created_at, r.guest_name, r.room_id, rm.room_number, rm.room_type
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.reservation_id
      JOIN rooms rm ON r.room_id = rm.room_id
      ORDER BY p.created_at DESC
    `);
    res.json({ payments: result.rows });
  } catch (err) {
    console.error('Error fetching payments:', err);
    res
      .status(500)
      .json({ error: 'Failed to fetch payments', details: err.message });
  }
});

app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  try {
    const reservationsCount = await pool.query(
      'SELECT COUNT(*) FROM reservations WHERE reservation_status = $1',
      ['confirmed']
    );
    const totalAmount = await pool.query(
      'SELECT SUM(total_amount) as total FROM reservations WHERE reservation_status = $1',
      ['confirmed']
    );
    const roomsBooked = await pool.query(
      'SELECT COUNT(DISTINCT room_id) as count FROM reservations WHERE reservation_status = $1',
      ['confirmed']
    );
    res.json({
      reservations: parseInt(reservationsCount.rows[0].count),
      totalAmount: parseFloat(totalAmount.rows[0].total || 0).toFixed(2),
      roomsBooked: parseInt(roomsBooked.rows[0].count),
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res
      .status(500)
      .json({ error: 'Failed to fetch stats', details: err.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    console.error('Health check failed:', err.message, err.stack);
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      details: err.message,
    });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({ error: 'Only image files are allowed' });
  }
  res
    .status(500)
    .json({ error: 'Internal server error', details: err.message });
});

const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  pool.end(() => {
    console.log('PostgreSQL pool has ended');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(port, () => {
      console.log(`Hotel booking server running at http://localhost:${port}`);
      console.log(`Database initialized with sample rooms and admin user`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message, err.stack);
    process.exit(1);
  }
};

startServer();

export default app;
