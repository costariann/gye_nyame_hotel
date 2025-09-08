import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Rooms = () => {
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [editingRoom, setEditingRoom] = useState(null);
  const [formData, setFormData] = useState({
    room_number: '',
    room_type: '',
    capacity: '',
    price_per_night: '',
    amenities: '',
    status: 'available',
  });
  const [images, setImages] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10); // Fixed at 10 items per page

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await axios.get(
          'https://gye-nyame-hotel-backend-neqd.onrender.com/api/rooms',
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
          }
        );
        setRooms(response.data.rooms);
      } catch (err) {
        console.error('Error fetching rooms:', err);
        setError('Failed to load rooms');
      }
    };
    fetchRooms();
  }, []);

  const handleEdit = (room) => {
    setEditingRoom(room);
    setFormData({
      room_number: room.room_number,
      room_type: room.room_type,
      capacity: room.capacity,
      price_per_night: room.price_per_night,
      amenities: room.amenities,
      status: room.status,
    });
    setImages([]);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    const data = new FormData();
    Object.keys(formData).forEach((key) => data.append(key, formData[key]));
    images.forEach((image) => data.append('images', image));

    try {
      const response = await axios.put(
        `https://gye-nyame-hotel-backend-neqd.onrender.com/api/rooms/${editingRoom.room_id}`,
        data,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setRooms(
        rooms.map((room) =>
          room.room_id === editingRoom.room_id
            ? response.data.roomDetails
            : room
        )
      );
      setEditingRoom(null);
      setFormData({
        room_number: '',
        room_type: '',
        capacity: '',
        price_per_night: '',
        amenities: '',
        status: 'available',
      });
      setImages([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update room');
    }
  };

  const handleDelete = async (roomId) => {
    if (!window.confirm('Are you sure you want to delete this room?')) return;
    try {
      await axios.delete(
        `https://gye-nyame-hotel-backend-neqd.onrender.com/api/rooms/${roomId}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      setRooms(rooms.filter((room) => room.room_id !== roomId));
    } catch (err) {
      console.error('Error deleting room:', err);
      setError('Failed to delete room');
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    setImages([...e.target.files]);
  };

  // Truncate amenities to 4 items
  const truncateAmenities = (amenities) => {
    const list = amenities.split(',').map((a) => a.trim());
    if (list.length > 3) {
      return list.slice(0, 3).join(', ') + ', etc.';
    }
    return amenities;
  };

  // Calculate total pages
  const totalPages = Math.ceil(rooms.length / itemsPerPage);

  // Get current items
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentRooms = rooms.slice(indexOfFirstItem, indexOfLastItem);

  // Handle page change
  const paginate = (pageNumber) => setCurrentPage(pageNumber);
  const nextPage = () =>
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const prevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));

  return (
    <div className="p-6">
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Rooms</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-auto bg-white shadow rounded">
          <thead>
            <tr className="bg-gray-200 text-sm md:text-base">
              <th className="p-2 text-left break-words">Room Number</th>
              <th className="p-2 text-left break-words">Type</th>
              <th className="p-2 text-left break-words">Capacity</th>
              <th className="p-2 text-left break-words">Price/Night</th>
              <th className="p-2 text-left break-words">Amenities</th>
              <th className="p-2 text-left break-words">Status</th>
              <th className="p-2 text-left break-words">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm md:text-base">
            {currentRooms.length > 0 ? (
              currentRooms.map((room) => (
                <tr key={room.room_id} className="border-t">
                  <td className="p-2 break-words">{room.room_number}</td>
                  <td className="p-2 break-words">{room.room_type}</td>
                  <td className="p-2 break-words">{room.capacity}</td>
                  <td className="p-2 break-words">GH¢{room.price_per_night}</td>
                  <td className="p-2 break-words">
                    {truncateAmenities(room.amenities)}
                  </td>
                  <td className="p-2 break-words">{room.status}</td>
                  <td className="p-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleEdit(room)}
                      className="bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(room.room_id)}
                      className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="p-4 text-center text-gray-500">
                  No rooms available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingRoom && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-lg">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Edit Room</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm md:text-base font-medium">
                  Room Number
                </label>
                <input
                  type="text"
                  name="room_number"
                  value={formData.room_number}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium">
                  Room Type
                </label>
                <input
                  type="text"
                  name="room_type"
                  value={formData.room_type}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium">
                  Capacity
                </label>
                <input
                  type="number"
                  name="capacity"
                  value={formData.capacity}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium">
                  Price per Night
                </label>
                <input
                  type="number"
                  name="price_per_night"
                  value={formData.price_per_night}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium">
                  Amenities
                </label>
                <input
                  type="text"
                  name="amenities"
                  value={formData.amenities}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium">
                  Images (optional)
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="flex flex-wrap gap-4 mt-2">
                <button
                  type="submit"
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  Update Room
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRoom(null)}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

export default Rooms;
