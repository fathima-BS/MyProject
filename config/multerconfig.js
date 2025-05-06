const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Directory for product images
const productDir = 'public/uploads/products';
if (!fs.existsSync(productDir)) {
    fs.mkdirSync(productDir, { recursive: true });
}

// Directory for profile images
const profileDir = 'public/uploads/profiles';
if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
}

// Storage configuration for product images
const productStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/products/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

// Storage configuration for profile images
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/profiles/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

// File filter for both product and profile images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, JPG, and PNG are allowed.'), false);
    }
};

// Multer instance for product images (up to 3 images)
const productUpload = multer({
    storage: productStorage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).array('productImage', 3);

// Multer instance for profile image (single image)
const profileUpload = multer({
    storage: profileStorage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).single('profileImage');

module.exports = {
    productUpload,
    profileUpload
};