import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { TreeView } from './pages/TreeView';
import { NotFound } from './pages/NotFound';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Verify } from './pages/Verify';
import { ResetRequest } from './pages/ResetRequest';
import { ResetPassword } from './pages/ResetPassword';
import { Trees } from './pages/Trees';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/demo/wongsuriya" element={<TreeView treeSlug="wongsuriya" />} />
        <Route path="/tree/:slug" element={<TreeView />} />

        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/verify" element={<Verify />} />
        <Route path="/auth/reset" element={<ResetRequest />} />
        <Route path="/auth/reset/confirm" element={<ResetPassword />} />

        {/* Protected */}
        <Route path="/trees" element={<Trees />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
