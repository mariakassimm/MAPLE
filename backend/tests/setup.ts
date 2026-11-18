// Runs before any module is imported, so src/config/env.ts sees these values.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/maple_unused_in_tests';
process.env.CLIENT_ORIGINS = 'http://localhost:5173';
process.env.CSRF_SECRET = 'test-csrf-secret-test-csrf-secret-0123456789';
process.env.BCRYPT_COST = '4';
process.env.DEMO_MODE = 'false'; // a developer's .env must not change what the suite expects
process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
process.env.CLOUDINARY_API_KEY = '123456789012345';
process.env.CLOUDINARY_API_SECRET = 'test-cloudinary-secret';
