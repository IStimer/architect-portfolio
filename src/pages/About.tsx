import SEO from '../components/SEO';
import { useLocalizedNavigate } from '../hooks/useLocalizedNavigate';
import '../styles/pages/About.scss';

const About = () => {
  const { navigateTo, currentLang } = useLocalizedNavigate();

  const aboutPath = currentLang === 'fr' ? `/${currentLang}/a-propos` : `/${currentLang}/about`;

  return (
    <>
      <SEO
        title="About"
        description="About — Your description here"
        path={aboutPath}
      />
      <main className="page-content about-page">
        <h1 className="about-page__title">About</h1>
        <button
          className="about-page__link cursor-target"
          onClick={() => navigateTo('home')}
        >
          Home
        </button>
      </main>
    </>
  );
};

export default About;
