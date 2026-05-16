import { HomeScreen } from '@/components/home/home-screen';

/**
 * Home Page — landing screen of the mini-app.
 *
 * The previous implementation redirected to /game/crash on mount, which
 * meant Crash was effectively the home screen. We now ship a proper
 * landing experience with a featured-game hero, the in-app games grid,
 * and quick actions for balance / bonuses.
 */
export default function HomePage() {
  return <HomeScreen />;
}
