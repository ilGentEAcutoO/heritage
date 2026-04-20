import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { TreeView } from './pages/TreeView';
import { Login } from './pages/Login';
import { AuthVerify } from './pages/AuthVerify';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/demo/wongsuriya" element={<TreeView treeSlug="wongsuriya" />} />
        <Route path="/tree/:slug" element={<TreeView />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/verify" element={<AuthVerify />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
