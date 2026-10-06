import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { LangProvider } from './i18n';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Browse } from './pages/Browse';
import { MusicDetail, TitleDetail } from './pages/Detail';
import { CountryPage, GenrePage, PersonPage } from './pages/Collections';
import { NotFound } from './pages/NotFound';
import './styles.css';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'watch', element: <Browse section="watch" /> },
      { path: 'listen', element: <Browse section="listen" /> },
      { path: 'title/:slug', element: <TitleDetail /> },
      { path: 'music/:slug', element: <MusicDetail /> },
      { path: 'genre/:slug', element: <GenrePage /> },
      { path: 'person/:slug', element: <PersonPage /> },
      { path: 'country/:code', element: <CountryPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <RouterProvider router={router} />
    </LangProvider>
  </StrictMode>,
);
