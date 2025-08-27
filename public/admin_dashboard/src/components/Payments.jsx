import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const response = await axios.get(
          'http://localhost:3000/api/admin/payments',
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
          }
        );
        setPayments(response.data.payments);
      } catch (err) {
        console.error('Error fetching payments:', err);
        setError('Failed to load payments');
      }
    };
    fetchPayments();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Payments</h1>
      {error && <p className="text-red-500">{error}</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white shadow rounded">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 text-left">Guest Name</th>
              <th className="p-2 text-left">Room</th>
              <th className="p-2 text-left">Amount</th>
              <th className="p-2 text-left">Method</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Transaction ID</th>
              <th className="p-2 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.payment_id} className="border-t">
                <td className="p-2">{payment.guest_name}</td>
                <td className="p-2">
                  {payment.room_number} ({payment.room_type})
                </td>
                <td className="p-2">GH¢{payment.amount}</td>
                <td className="p-2">{payment.payment_method}</td>
                <td className="p-2">{payment.payment_status}</td>
                <td className="p-2">{payment.transaction_id}</td>
                <td className="p-2">
                  {new Date(payment.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Payments;
