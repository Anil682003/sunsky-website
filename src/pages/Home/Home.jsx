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
  return (
    <>
      <Hero />
      <Marquee />
      <Categories />
      <Destinations />
      <Stats />
      <VacationTypes />
      <Hotels />
      <PopularDest />
      <Trust />
      <Newsletter />
    </>
  );
}
