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

  return (
    <>
      <Hero cms={cms} />
      <Marquee cms={cms} />
      <Categories cms={cms} />
      <Destinations cms={cms} />
      <Stats cms={cms} />
      <VacationTypes cms={cms} />
      <Hotels cms={cms} />
      <PopularDest cms={cms} />
      <Trust cms={cms} />
      <Newsletter cms={cms} />
    </>
  );
}
