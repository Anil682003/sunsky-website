import { useHomepageConfig } from '../../api';
import Hero from './sections/Hero';
import Marquee from './sections/Marquee';
import Categories from './sections/Categories';
import Destinations from './sections/Destinations';
import Stats from './sections/Stats';
import VacationTypes from './sections/VacationTypes';
import Hotels from './sections/Hotels';
import PopularDest from './sections/PopularDest';
import Trust from './sections/Trust';
import Newsletter from './sections/Newsletter';

export default function Home() {
  const { data: cms } = useHomepageConfig();
  const v = cms?.sectionVisibility || {};
  const on = (key) => v[key] !== false;

  return (
    <>
      {on('hero') && <Hero cms={cms} />}
      {on('marquee') && <Marquee cms={cms} />}
      {on('categories') && <Categories cms={cms} />}
      {on('destinations') && <Destinations cms={cms} />}
      {on('stats') && <Stats cms={cms} />}
      {on('vacationTypes') && <VacationTypes cms={cms} />}
      {on('hotels') && <Hotels cms={cms} />}
      {on('popularDest') && <PopularDest cms={cms} />}
      {on('trust') && <Trust cms={cms} />}
      {on('newsletter') && <Newsletter cms={cms} />}
    </>
  );
}
