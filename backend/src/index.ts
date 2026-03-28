import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { errorHandler, notFound } from './middleware/error.middleware';
import { ensureDefaultAdmin } from './modules/auth/auth.service';
import authRouter from './modules/auth/auth.router';
import clientRouter from './modules/clients/client.router';
import priceListRouter from './modules/price-lists/priceList.router';
import productRouter from './modules/products/product.router';
import orderRouter from './modules/orders/order.router';
import mailRouter from './modules/mail/mail.router';

// Ensure uploads directory exists
const uploadDir = path.resolve(config.uploadDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static uploads
app.use('/uploads', express.static(uploadDir));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/clients', clientRouter);
app.use('/api/price-lists', priceListRouter);
app.use('/api/products', productRouter);
app.use('/api/orders', orderRouter);
app.use('/api/mail', mailRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${config.port}`);
  console.log(`   Ambiente: ${config.nodeEnv}`);
  await ensureDefaultAdmin();
});

export default app;
