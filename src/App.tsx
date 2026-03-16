import './styles/main.scss';
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppStateProvider } from './contexts/AppStateContext';
import LenisProvider from './providers/LenisProvider';
import { HelmetProvider } from 'react-helmet-async';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import LanguageRedirect from './components/LanguageRedirect';
import LanguageLayout from './components/LanguageLayout';
import CustomCursor from './components/CustomCursor';

const About = lazy(() => import('./pages/About'));
const Project = lazy(() => import('./pages/Project'));

const PageLoader = () => (
  <div className="page-loader">
    <div className="page-loader__spinner" />
  </div>
);

const SuspenseAbout = () => (
  <Suspense fallback={<PageLoader />}><About /></Suspense>
);
const SuspenseProject = () => (
  <Suspense fallback={<PageLoader />}><Project /></Suspense>
);

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LanguageRedirect />} />

      <Route path="/:lang" element={<LanguageLayout />}>
        <Route index element={<Home />} />
        <Route path="a-propos" element={<SuspenseAbout />} />
        <Route path="about" element={<SuspenseAbout />} />
        <Route path="projet/:slug" element={<SuspenseProject />} />
        <Route path="project/:slug" element={<SuspenseProject />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <HelmetProvider>
    <ErrorBoundary>
      <Router>
        <AppStateProvider>
          <LenisProvider
            options={{
              duration: 1.2,
              smooth: true,
              smoothWheel: true,
              wheelMultiplier: 0.8
            }}
          >
            <CustomCursor />
            <AppRoutes />
          </LenisProvider>
        </AppStateProvider>
      </Router>
    </ErrorBoundary>
    </HelmetProvider>
  );
}

export default App;
