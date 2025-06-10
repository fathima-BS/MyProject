const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require('../../models/offerSchema');
const mongoose = require('mongoose');

const loadCartPage = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login?error=Please login to view your cart');
        }

        const userData = await User.findById(userId).lean();
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: { path: 'category' } // Populate category for Category offers
            })
            .lean();

        const currentDate = new Date();
        const itemsPerPage = 3; // Number of items per page
        const page = parseInt(req.query.page) || 1; // Get page number from query, default to 1

        // Calculate subtotal, total items, and attach offer data
        let subtotal = 0;
        let totalItems = 0;
        let updatedItems = [];

        if (cart && cart.items && cart.items.length > 0) {
            updatedItems = await Promise.all(cart.items.map(async (item) => {
                if (!item.productId) return null; // Skip invalid items

                // Fetch offers for the product
                const productOffer = await Offer.findOne({
                    offerType: 'Product',
                    applicableTo: item.productId._id,
                    isActive: true,
                    validFrom: { $lte: currentDate },
                    validUpto: { $gte: currentDate }
                }).lean();

                const categoryOffer = item.productId.category ? await Offer.findOne({
                    offerType: 'Category',
                    applicableTo: item.productId.category._id,
                    isActive: true,
                    validFrom: { $lte: currentDate },
                    validUpto: { $gte: currentDate }
                }).lean() : null;

                let finalOffer = null;
                if (productOffer && categoryOffer) {
                    finalOffer = productOffer.discountAmount > categoryOffer.discountAmount ? productOffer : categoryOffer;
                } else if (productOffer) {
                    finalOffer = productOffer;
                } else if (categoryOffer) {
                    finalOffer = categoryOffer;
                }

                const discountedPrice = finalOffer
                    ? item.productId.salePrice * (1 - finalOffer.discountAmount / 100)
                    : item.productId.salePrice;

                subtotal += discountedPrice * item.quantity;
                totalItems += item.quantity;

                return {
                    ...item,
                    finalOffer,
                    discountedPrice
                };
            }));

            // Filter out null items
            updatedItems = updatedItems.filter(item => item !== null);

            // Calculate pagination
            const totalItemsInCart = updatedItems.length;
            const totalPages = Math.ceil(totalItemsInCart / itemsPerPage);
            const startIndex = (page - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            updatedItems = updatedItems.slice(startIndex, endIndex);

            // Ensure page is within valid range
            if (page < 1 || page > totalPages) {
                return res.redirect('/cart?page=1');
            }

            // Calculate shipping cost: ₹60 if subtotal < ₹2000, otherwise ₹0
            const shippingCost = subtotal < 2000 ? 60 : 0;

            res.render('cart', {
                user: userData,
                cart: { ...cart, items: updatedItems },
                subtotal: subtotal.toFixed(2),
                totalItems,
                shippingCost: shippingCost.toFixed(2),
                total: (subtotal + shippingCost).toFixed(2),
                currentPage: page,
                totalPages: totalPages
            });
        } else {
            // Handle empty cart
            res.render('cart', {
                user: userData,
                cart: { items: [] },
                subtotal: 0,
                totalItems: 0,
                shippingCost: 0,
                total: 0,
                currentPage: 1,
                totalPages: 1
            });
        }
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const addToCart = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in to add items to the cart' });
        }

        const { productId, fromWishlist } = req.body;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const product = await Product.findById(productId).populate('category');
        if (!product || !product.isListed || product.quantity <= 0) {
            return res.status(400).json({ success: false, message: 'Product is not available' });
        }

        const currentDate = new Date();

        // Fetch Product Offer
        const productOffer = await Offer.findOne({
            offerType: 'Product',
            applicableTo: productId,
            isActive: true,
            validFrom: { $lte: currentDate },
            validUpto: { $gte: currentDate }
        }).exec();

        // Fetch Category Offer
        const categoryOffer = product.category ? await Offer.findOne({
            offerType: 'Category',
            applicableTo: product.category._id,
            isActive: true,
            validFrom: { $lte: currentDate },
            validUpto: { $gte: currentDate }
        }).exec() : null;

        // Determine the largest offer
        let finalOffer = null;
        if (productOffer && categoryOffer) {
            finalOffer = productOffer.discountAmount > categoryOffer.discountAmount ? productOffer : categoryOffer;
        } else if (productOffer) {
            finalOffer = productOffer;
        } else if (categoryOffer) {
            finalOffer = categoryOffer;
        }

        // Calculate price
        const price = finalOffer
            ? product.salePrice * (1 - finalOffer.discountAmount / 100)
            : product.salePrice;

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        if (itemIndex > -1) {
            const newQuantity = cart.items[itemIndex].quantity + 1;
            if (newQuantity > product.quantity || newQuantity > 5) {
                return res.status(400).json({ success: false, message: 'Cannot add more of this item' });
            }
            cart.items[itemIndex].quantity = newQuantity;
            cart.items[itemIndex].price = price;
            cart.items[itemIndex].totalPrice = price * newQuantity;
        } else {
            cart.items.push({
                productId,
                quantity: 1,
                price,
                totalPrice: price,
            });
        }

        await cart.save();

        // If the product was added from the wishlist, remove it from the wishlist
        if (fromWishlist) {
            let wishlist = await Wishlist.findOne({ userId });
            if (wishlist) {
                wishlist.products = wishlist.products.filter(item => item.productId.toString() !== productId);
                await wishlist.save();
            }
        }

        res.status(200).json({ success: true, message: 'Product added to cart successfully' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const incrementQuantity = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in to update cart' });
        }

        const { productId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const itemIndex = cart.items.findIndex(item => item.productId._id.toString() === productId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        const item = cart.items[itemIndex];
        if (item.quantity >= item.productId.quantity) {
            return res.status(400).json({ success: false, message: 'Stock limit reached' });
        }
        if (item.quantity >= 5) {
            return res.status(400).json({ success: false, message: 'Maximum quantity per item is 5' });
        }

        item.quantity += 1;
        item.totalPrice = item.price * item.quantity;
        await cart.save();

        res.status(200).json({ success: true, message: 'Quantity incremented successfully' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const decrementQuantity = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in to update cart' });
        }

        const { productId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const itemIndex = cart.items.findIndex(item => item.productId._id.toString() === productId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        const item = cart.items[itemIndex];
        if (item.quantity <= 1) {
            return res.status(400).json({ success: false, message: 'Minimum quantity is 1' });
        }

        item.quantity -= 1;
        item.totalPrice = item.price * item.quantity;
        await cart.save();

        res.status(200).json({ success: true, message: 'Quantity decremented successfully' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const removeItem = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in to update cart' });
        }

        const { productId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        cart.items = cart.items.filter(item => item.productId.toString() !== productId);
        await cart.save();

        res.status(200).json({ success: true, message: 'Item removed successfully' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const getCartCount = async (userId) => {
    try {
        if (!userId) return 0;

        const cart = await Cart.findOne({ userId });

        if (!cart || !cart.items) return 0;

        return cart.items.length;
    } catch (err) {
        console.error("Cart count error:", err);
        return 0;
    }
};

module.exports = {
    addToCart,
    loadCartPage,
    incrementQuantity,
    decrementQuantity,
    removeItem,
    getCartCount
};