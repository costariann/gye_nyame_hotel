import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10); // Fixed at 10 items per page

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
        console.log('Payments data:', response.data.payments);
        setPayments(response.data.payments);
      } catch (err) {
        console.error('Error fetching payments:', err);
        setError('Failed to load payments');
      }
    };
    fetchPayments();
  }, []);

  // Calculate total pages
  const totalPages = Math.ceil(payments.length / itemsPerPage);

  // Get current items
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = payments.slice(indexOfFirstItem, indexOfLastItem);

  // Handle page change
  const paginate = (pageNumber) => setCurrentPage(pageNumber);
  const nextPage = () =>
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const prevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));

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
            {currentItems.map((payment) => (
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
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <span className="text-gray-600">
            Showing {currentPage} of {totalPages} pages
          </span>
          <div className="flex space-x-2">
            <button
              onClick={prevPage}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-400"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(
              (number) => (
                <button
                  key={number}
                  onClick={() => paginate(number)}
                  className={`px-4 py-2 rounded ${
                    currentPage === number
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                  }`}
                >
                  {number}
                </button>
              )
            )}
            <button
              onClick={nextPage}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-400"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
