import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import AppRoutes from "./routes/AppRoutes";
import Navbar from "./components/common/Navbar";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/*" element={<AppRoutes />} />
      </Routes>
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
