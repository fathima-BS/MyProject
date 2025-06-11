const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const { productUpload } = require('../../config/multerconfig');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const loadProduct = async (req, res, next) => {
    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 3;
        const query = { isDeleted: false };
        if (search.trim()) {
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { 'brand.BrandName': { $regex: search, $options: 'i' } },
                { 'category.name': { $regex: search, $options: 'i' } }
            ];
        }
        const products = await Product.find(query)
            .populate('category brand')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();
        const count = await Product.countDocuments(query);
        const categories = await Category.find({ isListed: true, isDeleted: false });
        const brands = await Brand.find({ isListed: true, isDeleted: false });
        res.render('product', {
            products,
            category: categories,
            brand: brands,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            count: count,
            search: search
        });
    } catch (error) {
        console.error('Error in loadProduct:', error.stack);
        error.statusCode = 500;
        next(error);
    }
};

// Retry mechanism for file deletion
async function unlinkWithRetry(filePath, maxRetries = 3, delay = 100) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await fs.unlink(filePath);
            console.log(`Deleted file: ${filePath}`);
            return;
        } catch (err) {
            if (err.code === 'EBUSY' && attempt < maxRetries) {
                console.warn(`File busy, retrying (${attempt}/${maxRetries}): ${filePath}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            console.error(`Failed to delete ${filePath}:`, err);
            throw err; // Rethrow if max retries reached or other error
        }
    }
}

const addProduct = async (req, res, next) => {
    productUpload(req, res, async (err) => {
        if (err) {
            console.error('Multer error in addProduct:', err.stack);
            return res.status(400).json({ message: `Multer error: ${err.message}` });
        }
        try {
            const { productName, description, brand, category, salePrice, quantity } = req.body;

            // Validate required fields
            if (!productName || !description || !brand || !category || !salePrice || quantity === undefined || quantity === '') {
                console.log('Missing required fields:', { productName, description, brand, category, salePrice, quantity });
                return res.status(400).json({ message: 'Missing required fields' });
            }

            // Validate quantity and sale price for leading zeros
            if (/^0+[^0]/.test(quantity.toString())) {
                console.log('Invalid quantity, leading zeros:', quantity);
                return res.status(400).json({ message: 'Invalid quantity: Leading zeros are not allowed' });
            }
            if (/^0+[^0]/.test(salePrice.toString())) {
                console.log('Invalid sale price, leading zeros:', salePrice);
                return res.status(400).json({ message: 'Invalid sale price: Leading zeros are not allowed' });
            }

            // Validate quantity and sale price values
            const parsedQuantity = parseInt(quantity);
            const parsedSalePrice = parseFloat(salePrice);
            if (isNaN(parsedQuantity) || parsedQuantity < 0) {
                console.log('Invalid quantity value:', quantity);
                return res.status(400).json({ message: 'Quantity must be 0 or greater' });
            }
            if (isNaN(parsedSalePrice) || parsedSalePrice <= 0) {
                console.log('Invalid sale price value:', salePrice);
                return res.status(400).json({ message: 'Sale Price must be greater than 0' });
            }

            // Check for existing product name
            const existingProduct = await Product.findOne({ 
                productName: { $regex: `^${productName}$`, $options: 'i' },
                isDeleted: false 
            });
            if (existingProduct) {
                console.log('Product name already exists:', productName);
                return res.status(400).json({ message: 'Product name already exists' });
            }

            // Validate brand and category
            const validBrand = await Brand.findById(brand);
            const validCategory = await Category.findById(category);
            if (!validBrand || !validCategory) {
                console.log('Invalid brand or category:', { brand, category });
                return res.status(400).json({ message: 'Invalid brand or category' });
            }

            // Validate images
            if (!req.files || req.files.length < 3) {
                console.log('Insufficient images:', req.files ? req.files.length : 0);
                return res.status(400).json({ message: 'Please upload exactly 3 images' });
            }
            if (req.files.length > 3) {
                console.log('Too many images:', req.files.length);
                return res.status(400).json({ message: 'Maximum 3 images allowed' });
            }

            // Convert uploaded images to WebP
            const productImage = [];
            for (const file of req.files) {
                const filePath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'products', file.filename);
                const newFileName = `product-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
                const newPath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'products', newFileName);
                try {
                    await sharp(filePath)
                        .webp({ quality: 80 })
                        .toFile(newPath);
                    try {
                        await unlinkWithRetry(filePath);
                    } catch (err) {
                        console.warn(`Non-critical error: Failed to delete original file ${filePath}. Continuing...`);
                    }
                    productImage.push(`/Uploads/products/${newFileName}`);
                } catch (err) {
                    console.error(`Failed to convert ${file.filename} to WebP:`, err);
                    return res.status(500).json({ message: 'Error processing images' });
                }
            }

            const product = new Product({ 
                productName, 
                description, 
                brand, 
                category, 
                salePrice: parsedSalePrice, 
                quantity: parsedQuantity, 
                productImage 
            });
            await product.save();
            res.status(201).json({ message: 'Product added successfully', product });
        } catch (error) {
            console.error('Error in addProduct:', error.stack);
            error.statusCode = 500;
            next(error);
        }
    });
};

const getProduct = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id).populate('category brand');
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (error) {
        console.error('Error in getProduct:', error.stack);
        error.statusCode = 500;
        next(error);
    }
};

const editProduct = async (req, res, next) => {
    productUpload(req, res, async (err) => {
        if (err) {
            console.error('Multer error in editProduct:', err.stack);
            return res.status(400).json({ message: `Multer error: ${err.message}` });
        }
        try {
            const { productId, productName, description, brand, category, salePrice, quantity } = req.body;
            console.log('editProduct request body:', req.body);
            console.log('editProduct files:', req.files);

            if (!productId) {
                console.log('Missing productId');
                return res.status(400).json({ message: 'Product ID is required' });
            }
            const product = await Product.findById(productId);
            if (!product) {
                console.log('Product not found:', productId);
                return res.status(404).json({ message: 'Product not found' });
            }

            // Validate required fields
            if (!productName || !description || !brand || !category || !salePrice || quantity === undefined || quantity === '') {
                console.log('Missing required fields:', { productName, description, brand, category, salePrice, quantity });
                return res.status(400).json({ message: 'Missing required fields' });
            }

            // Validate quantity and sale price for leading zeros
            if (/^0+[^0]/.test(quantity.toString())) {
                console.log('Invalid quantity, leading zeros:', quantity);
                return res.status(400).json({ message: 'Invalid quantity: Leading zeros are not allowed' });
            }
            if (/^0+[^0]/.test(salePrice.toString())) {
                console.log('Invalid sale price, leading zeros:', salePrice);
                return res.status(400).json({ message: 'Invalid sale price: Leading zeros are not allowed' });
            }

            // Validate quantity and sale price values
            const parsedQuantity = parseInt(quantity);
            const parsedSalePrice = parseFloat(salePrice);
            if (isNaN(parsedQuantity) || parsedQuantity < 0) {
                console.log('Invalid quantity value:', quantity);
                return res.status(400).json({ message: 'Quantity must be 0 or greater' });
            }
            if (isNaN(parsedSalePrice) || parsedSalePrice <= 0) {
                console.log('Invalid sale price value:', salePrice);
                return res.status(400).json({ message: 'Sale Price must be greater than 0' });
            }

            // Check for existing product name (excluding the current product)
            const existingProduct = await Product.findOne({ 
                productName: { $regex: `^${productName}$`, $options: 'i' },
                isDeleted: false,
                _id: { $ne: productId }
            });
            if (existingProduct) {
                console.log('Product name already exists:', productName);
                return res.status(400).json({ message: 'Product name already exists' });
            }

            // Validate brand and category
            const validBrand = await Brand.findById(brand);
            const validCategory = await Category.findById(category);
            if (!validBrand || !validCategory) {
                console.log('Invalid brand or category:', { brand, category });
                return res.status(400).json({ message: 'Invalid brand or category' });
            }

            // Update fields
            product.productName = productName;
            product.description = description;
            product.brand = brand;
            product.category = category;
            product.salePrice = parsedSalePrice;
            product.quantity = parsedQuantity;

            // Handle images
            let updatedImages = [];
            if (req.files && req.files.length > 0) {
                // Convert new images to WebP
                const newImages = [];
                for (const file of req.files) {
                    const filePath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'products', file.filename);
                    const newFileName = `product-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
                    const newPath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'products', newFileName);
                    try {
                        await sharp(filePath)
                            .webp({ quality: 80 })
                            .toFile(newPath);
                        try {
                            await unlinkWithRetry(filePath);
                        } catch (err) {
                            console.warn(`Non-critical error: Failed to delete original file ${filePath}. Continuing...`);
                        }
                        newImages.push(`/Uploads/products/${newFileName}`);
                    } catch (err) {
                        console.error(`Failed to convert ${file.filename} to WebP:`, err);
                        return res.status(500).json({ message: 'Error processing images' });
                    }
                }
                updatedImages = newImages.slice(0, 3);
                if (updatedImages.length < 3) {
                    const remainingCount = 3 - updatedImages.length;
                    const existingImages = product.productImage || [];
                    // Convert existing images to WebP if not already
                    for (let img of existingImages.slice(0, remainingCount)) {
                        if (!img.endsWith('.webp')) {
                            const oldPath = path.join(__dirname, '..', '..', 'public', img);
                            const newFileName = `product-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
                            const newPath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'products', newFileName);
                            try {
                                await sharp(oldPath)
                                    .webp({ quality: 80 })
                                    .toFile(newPath);
                                try {
                                    await unlinkWithRetry(oldPath);
                                } catch (err) {
                                    console.warn(`Non-critical error: Failed to delete original file ${oldPath}. Continuing...`);
                                }
                                updatedImages.push(`/Uploads/products/${newFileName}`);
                            } catch (err) {
                                console.error(`Failed to convert image ${oldPath} to WebP:`, err);
                            }
                        } else {
                            updatedImages.push(img);
                        }
                    }
                    updatedImages = updatedImages.slice(0, 3);
                }
            } else {
                updatedImages = product.productImage || [];
                if (req.body.existingImages) {
                    const existingImages = Array.isArray(req.body.existingImages) 
                        ? req.body.existingImages 
                        : [req.body.existingImages];
                    const filteredImages = existingImages.filter(img => product.productImage.includes(img)).slice(0, 3);
                    // Convert existing images to WebP if not already
                    const convertedImages = [];
                    for (let img of filteredImages) {
                        if (!img.endsWith('.webp')) {
                            const oldPath = path.join(__dirname, '..', '..', 'public', img);
                            const newFileName = `product-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
                            const newPath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'products', newFileName);
                            try {
                                await sharp(oldPath)
                                    .webp({ quality: 80 })
                                    .toFile(newPath);
                                try {
                                    await unlinkWithRetry(oldPath);
                                } catch (err) {
                                    console.warn(`Non-critical error: Failed to delete original file ${oldPath}. Continuing...`);
                                }
                                convertedImages.push(`/Uploads/products/${newFileName}`);
                            } catch (err) {
                                console.error(`Failed to convert image ${oldPath} to WebP:`, err);
                                convertedImages.push(img); // Fallback to original
                            }
                        } else {
                            convertedImages.push(img);
                        }
                    }
                    updatedImages = convertedImages.slice(0, 3);
                }
            }

            if (updatedImages.length !== 3) {
                console.log('Invalid image count:', updatedImages.length);
                return res.status(400).json({ message: 'Exactly 3 images are required' });
            }

            // Delete old images that are no longer used
            const oldImages = product.productImage || [];
            const imagesToDelete = oldImages.filter(img => !updatedImages.includes(img));
            for (const img of imagesToDelete) {
                const filePath = path.join(__dirname, '..', '..', 'public', img);
                try {
                    await unlinkWithRetry(filePath);
                } catch (err) {
                    console.warn(`Non-critical error: Failed to delete old image ${filePath}. Continuing...`);
                }
            }

            product.productImage = updatedImages;
            await product.save();

            res.status(200).json({ message: 'Product updated successfully', product });
        } catch (error) {
            console.error('Error in editProduct:', error.stack);
            error.statusCode = 500;
            next(error);
        }
    });
};

const deleteProduct = async (req, res, next) => {
    try {
        const id = req.params.id;
        const product = await Product.findByIdAndUpdate(id, { $set: { isDeleted: true } });
        if (!product) {
            return res.json({ success: false, message: 'Product not found!' });
        }
        // Delete associated images
        for (const img of product.productImage || []) {
            const filePath = path.join(__dirname, '..', '..', 'public', img);
            try {
                await unlinkWithRetry(filePath);
            } catch (err) {
                console.warn(`Non-critical error: Failed to delete image ${filePath}. Continuing...`);
            }
        }
        return res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error in deleteProduct:', error.stack);
        error.statusCode = 500;
        next(error);
    }
};

const unlistProduct = async (req, res, next) => {
    try {
        const id = req.params.id;
        const product = await Product.findByIdAndUpdate(id, { $set: { isListed: false } });
        if (!product) {
            return res.json({ success: false, message: 'Product not found!' });
        }
        return res.json({ success: true, message: 'Product unlisted' });
    } catch (error) {
        console.error('Error in unlistProduct:', error.stack);
        error.statusCode = 500;
        next(error);
    }
};

const listProduct = async (req, res, next) => {
    try {
        const id = req.params.id;
        const product = await Product.findByIdAndUpdate(id, { $set: { isListed: true } });
        if (!product) {
            return res.json({ success: false, message: 'Product not found!' });
        }
        return res.json({ success: true, message: 'Product listed' });
    } catch (error) {
        console.error('Error in listProduct:', error.stack);
        error.statusCode = 500;
        next(error);
    }
};

module.exports = {
    loadProduct,
    addProduct,
    getProduct,
    editProduct,
    deleteProduct,
    unlistProduct,
    listProduct
};