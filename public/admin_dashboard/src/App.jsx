import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Reservations from './components/Reservations';
import Payments from './components/Payments';
import CreateRoom from './components/CreateRoom';
import Rooms from './components/Rooms';
import SignIn from './components/SignIn';
import SignUp from './components/SignUp';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          await axios.get(
            'https://gye-nyame-hotel-backend-neqd.onrender.com/api/auth/verify',
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
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

  const handleSignOut = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen">
        {/* Header stays at the top if logged in */}
        {isAuthenticated && (
          <Header
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            handleSignOut={handleSignOut}
          />
        )}

        {/* Sidebar + main content below header */}
        <div className="flex flex-1 overflow-hidden">
          {isAuthenticated && (
            <Sidebar
              isOpen={isSidebarOpen}
              toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
          )}
          <main className="flex-1 overflow-y-auto bg-gray-100 p-4">
            <Routes>
              <Route
                path="/signin"
                element={
                  isAuthenticated ? (
                    <Navigate to="/" />
                  ) : (
                    <SignIn setIsAuthenticated={setIsAuthenticated} />
                  )
                }
              />
              <Route
                path="/signup"
                element={isAuthenticated ? <Navigate to="/" /> : <SignUp />}
              />
              <Route
                path="/"
                element={
                  isAuthenticated ? <Dashboard /> : <Navigate to="/signin" />
                }
              />
              <Route
                path="/reservations"
                element={
                  isAuthenticated ? <Reservations /> : <Navigate to="/signin" />
                }
              />
              <Route
                path="/payments"
                element={
                  isAuthenticated ? <Payments /> : <Navigate to="/signin" />
                }
              />
              <Route
                path="/rooms/create"
                element={
                  isAuthenticated ? <CreateRoom /> : <Navigate to="/signin" />
                }
              />
              <Route
                path="/rooms"
                element={
                  isAuthenticated ? <Rooms /> : <Navigate to="/signin" />
                }
              />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
