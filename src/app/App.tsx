import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { TreeView } from './pages/TreeView';
import { NotFound } from './pages/NotFound';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Verify } from './pages/Verify';
import { Magic } from './pages/Magic';
import { ResetRequest } from './pages/ResetRequest';
import { ResetPassword } from './pages/ResetPassword';
import { Trees } from './pages/Trees';

// NOTE: routes are eagerly imported on purpose. Route-level code splitting was
// measured to *hurt* the heavy tree routes on mobile (entry → route-chunk
// waterfall) without helping the already-tiny auth pages, because the React core
// dominates first paint. On-demand panels are still lazy where it's pure win:
// the dialogs/PathFinder in TreeView and CreateTreeDialog in Trees load on click.
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/demo/wongsuriya" element={<TreeView treeSlug="wongsuriya" />} />
        <Route path="/tree/:slug" element={<TreeView />} />

        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/verify" element={<Verify />} />
        <Route path="/auth/magic" element={<Magic />} />
        <Route path="/auth/reset" element={<ResetRequest />} />
        <Route path="/auth/reset/confirm" element={<ResetPassword />} />

        {/* Protected */}
        <Route path="/trees" element={<Trees />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
