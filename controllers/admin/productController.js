const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const { productUpload } = require('../../config/multerconfig')

const loadProduct = async (req, res) => {
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
        console.error('Error loading products:', error.stack);
        res.status(500).send('Internal server error');
    }
};

const addProduct = async (req, res) => {
    productUpload(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err.stack);
            return res.status(400).json({ message: `Multer error: ${err.message}` });
        }
        try {
            const { productName, description, brand, category, regularPrice, salePrice, productOffer, quantity, status } = req.body;

            if (!productName || !description || !brand || !category || !regularPrice || !salePrice || !quantity || !status) {
                return res.status(400).json({ message: 'Missing required fields' });
            }
            const validBrand = await Brand.findById(brand);
            const validCategory = await Category.findById(category);
            if (!validBrand || !validCategory) return res.status(400).json({ message: 'Invalid brand or category' });
            if (!req.files || req.files.length < 3) return res.status(400).json({ message: 'Please upload exactly 3 images' });
            if (req.files.length > 3) return res.status(400).json({ message: 'Maximum 3 images allowed' });

            const productImage = req.files.map(file => `/uploads/products/${file.filename}`).slice(0, 3);
            const product = new Product({ productName, description, brand, category, regularPrice: parseFloat(regularPrice), salePrice: parseFloat(salePrice), productOffer: parseFloat(productOffer) || 0, quantity: parseInt(quantity), productImage, status });
            await product.save();
            res.status(201).json({ message: 'Product added successfully', product });
        } catch (error) {
            console.error('Error adding product:', error.stack);
            res.status(500).json({ message: `Server error: ${error.message}` });
        }
    });
};

const getProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category brand');
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

const editProduct = async (req, res) => {
    productUpload(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err.stack);
            return res.status(400).json({ message: `Multer error: ${err.message}` });
        }
        try {
            const { productId, productName, description, brand, category, regularPrice, salePrice, productOffer, quantity, status } = req.body;
            if (!productId) {
                return res.status(400).json({
                    message: 'Product ID is required'
                });
            }
            const product = await Product.findById(productId);
            if (!product) {
                return res.status(404).json({
                    message: 'Product not found'
                });
            }
            const validBrand = await Brand.findById(brand);
            const validCategory = await Category.findById(category);
            if (!validBrand || !validCategory) {
                return res.status(400).json({
                    message: 'Invalid brand or category'
                });
            }

            
            product.productName = productName || product.productName;
            product.description = description || product.description;
            product.brand = brand || product.brand;
            product.category = category || product.category;
            product.regularPrice = parseFloat(regularPrice) || product.regularPrice;
            product.salePrice = parseFloat(salePrice) || product.salePrice;
            product.productOffer = parseFloat(productOffer) || product.productOffer;
            product.quantity = parseInt(quantity) || product.quantity;
            product.status = status || product.status;

            let updatedImages = product.productImage || [];
            if (req.body.existingImages) {
                const existingImages = Array.isArray(req.body.existingImages) ? req.body.existingImages : [req.body.existingImages];
                updatedImages = existingImages.filter(img => product.productImage.includes(img));
            }
            if (req.files && req.files.length > 0) {
                const newImages = req.files.map(file => `/uploads/products/${file.filename}`);
                updatedImages = [...updatedImages, ...newImages].slice(0, 3); 
            }
            if (updatedImages.length > 3) updatedImages = updatedImages.slice(0, 3);
            product.productImage = updatedImages;
            await product.save();
            res.status(200).json({ message: 'Product updated successfully', product });
        } catch (error) {
            console.error('Error editing product:', error.stack);
            res.status(500).json({ message: `Server error: ${error.message}` });
        }
    });
};

const deleteProduct = async (req, res) => {
    try {
        const id = req.params.id
        const product = await Product.findByIdAndUpdate(id, { $set: { isDeleted: true } })
        if (!product) {
            return res.json({ success: false, message: 'Product not found!' })
        }
        return res.json({ success: true, message: 'Product deleted successfully' })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ success: false, message: 'Internal server error' })
    }
};

const unlistProduct = async (req, res) => {
    try {
        const id = req.params.id
        const product = await Product.findByIdAndUpdate(id, { $set: { isListed: false } })
        if (!product) {
            return res.json({ success: false, message: 'Product not found!' })
        }
        return res.json({ success: true, message: 'Product unlisted' })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ success: false, message: 'Internal server error' })
    }
}


const listProduct = async (req, res) => {
    try {
        const id = req.params.id
        const product = await Product.findByIdAndUpdate(id, { $set: { isListed: true } })
        if (!product) {
            return res.json({ success: false, message: 'Product not found!' })
        }
        return res.json({ success: true, message: 'Product listed' })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ success: false, message: 'Internal server error' })
    }
}

module.exports = {
    loadProduct,
    addProduct,
    getProduct,
    editProduct,
    deleteProduct,
    unlistProduct,
    listProduct
};