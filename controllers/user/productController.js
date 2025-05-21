const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require('../../models/offerSchema');

const productDetailPage = async (req, res) => {
    try {
        const productId = req.params.id;
        const currentDate = new Date();

        // Fetch the product with populated brand and category
        const product = await Product.findById(productId).populate('brand category');
        if (!product) {
            return res.status(404).render('error', { message: 'Product not found' });
        }

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

        // Calculate discounted price
        const discountedPrice = finalOffer
            ? product.salePrice * (1 - finalOffer.discountAmount / 100)
            : product.salePrice;

        // Fetch related products
        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId },
            isListed: true,
            isDeleted: false
        })
            .populate('brand')
            .populate('category')
            .limit(4);

        // Add offer data for related products
        const relatedProductsWithOffers = await Promise.all(relatedProducts.map(async (prod) => {
            const prodOffer = await Offer.findOne({
                offerType: 'Product',
                applicableTo: prod._id,
                isActive: true,
                validFrom: { $lte: currentDate },
                validUpto: { $gte: currentDate }
            }).exec();

            const catOffer = prod.category ? await Offer.findOne({
                offerType: 'Category',
                applicableTo: prod.category._id,
                isActive: true,
                validFrom: { $lte: currentDate },
                validUpto: { $gte: currentDate }
            }).exec() : null;

            let prodFinalOffer = null;
            if (prodOffer && catOffer) {
                prodFinalOffer = prodOffer.discountAmount > catOffer.discountAmount ? prodOffer : catOffer;
            } else if (prodOffer) {
                prodFinalOffer = prodOffer;
            } else if (catOffer) {
                prodFinalOffer = catOffer;
            }

            const prodDiscountedPrice = prodFinalOffer
                ? prod.salePrice * (1 - prodFinalOffer.discountAmount / 100)
                : prod.salePrice;

            return {
                ...prod._doc,
                finalOffer: prodFinalOffer,
                discountedPrice: prodDiscountedPrice
            };
        }));

        // Check if product is in wishlist
        const wishlist = await Wishlist.findOne({ userId: req.session.user?._id });
        const isInWishlist = wishlist ? wishlist.products.some(item => item.productId.toString() === productId) : false;

        res.render('productDetail', {
            product,
            title: product.productName,
            relatedProducts: relatedProductsWithOffers,
            isInWishlist,
            finalOffer,
            discountedPrice
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Server error' });
    }
};

module.exports = {
    productDetailPage,
};