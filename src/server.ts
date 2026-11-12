import dotenv from 'dotenv';
dotenv.config();

// Kunci timezone default ke Asia/Jakarta (WIB) jika belum diset
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

import app from './app';
import { prisma } from './config/db';

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server Worky Backend berjalan di http://localhost:${PORT}`);
});

// Graceful Shutdown saat server dimatikan
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  server.close(() => {
    console.log('Server dan koneksi database ditutup secara aman.');
    process.exit(0);
  });
});