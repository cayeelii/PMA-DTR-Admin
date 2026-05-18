import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const bioIdCheck = /^\d{1,6}$/;

const EmployeeLoginPage = ({ setUser }) => {
  const [credentials, setCredentials] = useState({ bio_id: "", password: "" });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    if (!bioIdCheck.test(credentials.bio_id)) {
      setErrorMessage("Bio ID must be 1 to 6 digits only.");
      setIsSubmitting(false);
      return;
    }

    //Fetch employee login
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/employeeLogin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      const data = await response.json();
      const ok = response.ok;

      if (!ok) {
        setErrorMessage(data.error || "Employee login failed.");
        return;
      }

      setUser(data.user);
      navigate("/employee/home", { replace: true });
    } catch (error) {
      setErrorMessage("Unable to connect to server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-4">
      <div className="flex flex-col md:flex-row w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden min-h-[500px]">
        <div className="md:w-5/12 bg-[#00154d] p-8 flex flex-col items-center justify-center text-center relative">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#fdd835]"></div>

          <img
            src="/pmalogo.png"
            alt="PMA Logo"
            className="w-32 h-32 mb-6 object-contain"
          />
          <h1 className="text-white text-xl font-bold tracking-wider uppercase">
            DTR Processing System
          </h1>
          <p className="text-blue-200 text-xs mt-2 font-medium tracking-widest uppercase">
            Philippine Military Academy
          </p>
        </div>

        <div className="md:w-7/12 bg-[#f4f4f4] p-8 md:p-16 flex flex-col justify-center">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-800 tracking-tight">
              WELCOME BACK!
            </h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-gray-600 text-sm font-semibold mb-2">
                BioID
              </label>
              <input
                type="text"
                name="bio_id"
                value={credentials.bio_id}
                onChange={handleChange}
                className={`w-full px-4 py-3 rounded-lg border transition-all outline-none focus:ring-2 focus:ring-[#00154d] focus:border-transparent bg-white ${errorMessage ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                placeholder="Enter 1-6 digit BioID"
                title="Bio ID must be 1 to 6 digits."
                required
              />
            </div>

            <div>
              <label className="block text-gray-600 text-sm font-semibold mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={credentials.password}
                onChange={handleChange}
                className={`w-full px-4 py-3 rounded-lg border transition-all outline-none focus:ring-2 focus:ring-[#00154d] focus:border-transparent bg-white ${errorMessage ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                required
              />
              {errorMessage && (
                <div className="mt-1 text-xs text-red-600 font-medium px-1">
                  {errorMessage}
                </div>
              )}
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-blue-900 mt-2 transition-colors"
              >
                Forgot Password?
              </button>
            </div>

            <div className="pt-4 flex justify-center">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full md:w-1/2 bg-[#0b246a] hover:bg-[#00154d] text-white font-bold py-3 px-6 rounded-lg shadow-lg transition-all transform active:scale-95"
              >
                {isSubmitting ? "Logging in..." : "Log In"}
              </button>
            </div>
            <div className="text-center">
              <Link
                to="/employee-register"
                className="text-xs text-[#0b246a] hover:text-[#00154d] font-semibold transition-colors"
              >
                Create Account
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EmployeeLoginPage;
