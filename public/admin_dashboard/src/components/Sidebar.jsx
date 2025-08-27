import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const [isRoomsOpen, setIsRoomsOpen] = useState(false);

  return (
    <aside
      className={`fixed md:static top-0 left-0 h-full bg-blue-500 text-white w-64 transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0 transition-transform duration-300 z-50`}
    >
      <div className="p-4">
        <button className="md:hidden mb-4" onClick={toggleSidebar}>
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        <nav>
          <NavLink
            to="/"
            className={({ isActive }) =>
              `block py-2 px-4 rounded ${
                isActive ? 'bg-blue-600' : 'hover:bg-blue-700'
              }`
            }
            onClick={toggleSidebar}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/reservations"
            className={({ isActive }) =>
              `block py-2 px-4 rounded ${
                isActive ? 'bg-blue-600' : 'hover:bg-blue-700'
              }`
            }
            onClick={toggleSidebar}
          >
            Reservations
          </NavLink>
          <NavLink
            to="/payments"
            className={({ isActive }) =>
              `block py-2 px-4 rounded ${
                isActive ? 'bg-blue-600' : 'hover:bg-blue-700'
              }`
            }
            onClick={toggleSidebar}
          >
            Payments
          </NavLink>
          <div>
            <button
              onClick={() => setIsRoomsOpen(!isRoomsOpen)}
              className="block w-full text-left py-2 px-4 rounded hover:bg-blue-700 flex items-center"
            >
              Rooms
              <svg
                className={`w-4 h-4 ml-2 transform ${
                  isRoomsOpen ? 'rotate-180' : ''
                }`}
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
            {isRoomsOpen && (
              <div className="pl-4">
                <NavLink
                  to="/rooms/create"
                  className={({ isActive }) =>
                    `block py-2 px-4 rounded ${
                      isActive ? 'bg-blue-600' : 'hover:bg-blue-700'
                    }`
                  }
                  onClick={toggleSidebar}
                >
                  Create Room
                </NavLink>
                <NavLink
                  to="/rooms"
                  className={({ isActive }) =>
                    `block py-2 px-4 rounded ${
                      isActive ? 'bg-blue-600' : 'hover:bg-blue-700'
                    }`
                  }
                  onClick={toggleSidebar}
                >
                  Rooms
                </NavLink>
              </div>
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
