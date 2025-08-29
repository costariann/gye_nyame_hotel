import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import logo from '../assets/logo/gyenyamelogo2.PNG';

const Header = ({ toggleSidebar, handleSignOut }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  // Verify token logic - outside of return
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          await axios.get('http://localhost:3000/api/auth/verify', {
            headers: { Authorization: `Bearer ${token}` },
          });
          setIsAuthenticated(true);
        } catch (err) {
          console.error('Token verification failed:', err);
          localStorage.removeItem('token');
          setIsAuthenticated(false);
        }
      }
    };
    verifyToken();
  }, []);

  // Handle dropdown toggle
  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  // Handle signout
  const signOut = () => {
    handleSignOut();
    navigate('/signin');
  };

  return (
    <header className="bg-white shadow px-6 py-4 flex items-center justify-between">
      <div className="flex items-center">
        {/* Sidebar toggle button */}
        <button className="md:hidden mr-4" onClick={toggleSidebar}>
          ☰
        </button>

        {/* Logo */}
        <img src={logo} alt="Hotel Logo" className="w-20" />
      </div>

      {/* Search */}
      <div className="flex-1 mx-4 max-w-lg">
        <input
          type="text"
          placeholder="Search..."
          className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Dropdown */}
      {isAuthenticated && (
        <div className="relative">
          <button
            onClick={toggleDropdown}
            className="flex items-center space-x-2"
          >
            <span>Admin</span>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white shadow-lg rounded py-2">
              <button
                onClick={signOut}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
