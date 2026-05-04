import Navbar from './Navbar/Navbar';
import Footer from './Footer/Footer';

export default function Layout({ children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Navbar />
      <main style={{ flex:1 }}>{children}</main>
      <Footer />
    </div>
  );
}
