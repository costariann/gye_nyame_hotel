import React, { useState } from 'react';
import axios from 'axios';

const CreateRoom = () => {
  const [formData, setFormData] = useState({
    room_number: '',
    room_type: '',
    capacity: '',
    price_per_night: '',
    amenities: '',
    status: 'available',
  });
  const [images, setImages] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    setImages((prev) => [...prev, ...files]);
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const data = new FormData();
    Object.keys(formData).forEach((key) => data.append(key, formData[key]));
    images.forEach((image) => data.append('images', image));

    try {
      const response = await axios.post(
        'http://localhost:3000/api/rooms',
        data,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setSuccess(response.data.message);
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
      setError(err.response?.data?.error || 'Failed to create room');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white shadow-md rounded-lg">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Create Room</h1>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {success && <p className="text-green-500 mb-4">{success}</p>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Room Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Room Number
          </label>
          <input
            type="text"
            name="room_number"
            value={formData.room_number}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Room Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Room Type
          </label>
          <input
            type="text"
            name="room_type"
            value={formData.room_type}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Capacity */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Capacity
          </label>
          <input
            type="number"
            name="capacity"
            value={formData.capacity}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Price per Night
          </label>
          <input
            type="number"
            name="price_per_night"
            value={formData.price_per_night}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Amenities */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Amenities
          </label>
          <input
            type="text"
            name="amenities"
            value={formData.amenities}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="WiFi, AC, TV"
            required
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Upload Images
          </label>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageChange}
            className="w-full p-2 border rounded-lg"
          />

          {/* Preview Images */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3">
              {images.map((img, index) => (
                <div
                  key={index}
                  className="relative w-24 h-24 border rounded overflow-hidden"
                >
                  <img
                    src={URL.createObjectURL(img)}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full text-xs px-2 py-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          Create Room
        </button>
      </form>
    </div>
  );
};

export default CreateRoom;
