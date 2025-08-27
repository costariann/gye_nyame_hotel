import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Reservations = () => {
  const [reservations, setReservations] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchReservations = async () => {
      try {
        const response = await axios.get(
          'http://localhost:3000/api/admin/reservations',
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
          }
        );
        setReservations(response.data.reservations);
      } catch (err) {
        console.error('Error fetching reservations:', err);
        setError('Failed to load reservations');
      }
    };
    fetchReservations();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Reservations</h1>
      {error && <p className="text-red-500">{error}</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white shadow rounded">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 text-left">Guest Name</th>
              <th className="p-2 text-left">Room</th>
              <th className="p-2 text-left">Check-In</th>
              <th className="p-2 text-left">Check-Out</th>
              <th className="p-2 text-left">Guests</th>
              <th className="p-2 text-left">Amount</th>
              <th className="p-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => (
              <tr key={reservation.reservation_id} className="border-t">
                <td className="p-2">{reservation.guest_name}</td>
                <td className="p-2">
                  {reservation.room_number} ({reservation.room_type})
                </td>
                <td className="p-2">
                  {new Date(reservation.check_in_date).toLocaleDateString()}
                </td>
                <td className="p-2">
                  {new Date(reservation.check_out_date).toLocaleDateString()}
                </td>
                <td className="p-2">{reservation.guest_count}</td>
                <td className="p-2">GH¢{reservation.total_amount}</td>
                <td className="p-2">{reservation.reservation_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reservations;
