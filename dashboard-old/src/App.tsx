import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import Memory from './pages/Memory';
import Trackers from './pages/Trackers';
import Settings from './pages/Settings';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path='/' element={<Dashboard />} />
        <Route path='/chat' element={<Chat />} />
        <Route path='/memory' element={<Memory />} />
        <Route path='/trackers' element={<Trackers />} />
        <Route path='/settings' element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default App;
