const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wishlist=require('../../models/wishlistSchema')
const mongoose = require('mongoose');



const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to add items to the cart' });
    }

    const { productId ,fromWishlist } = req.body;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const product = await Product.findById(productId);
    if (!product || !product.isListed || product.quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Product is not available' });
    }

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
      cart.items[itemIndex].totalPrice = product.salePrice * newQuantity;
    } else {
      cart.items.push({
        productId,
        quantity: 1,
        price: product.salePrice,
        totalPrice: product.salePrice,
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
    console.error('Error adding to cart:', error);
    res.status(500).json({ success: false, message: 'Error adding to cart' });
  }
};

const loadCartPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login?error=Please login to view your cart');
    }

    const userData = await User.findById(userId).lean();
    const cart = await Cart.findOne({ userId }).populate('items.productId').lean();

    // Calculate subtotal and shipping cost
    let subtotal = 0;
    let totalItems = 0;
    if (cart && cart.items && cart.items.length > 0) {
      cart.items.forEach(item => {
        if (item.productId) {
          subtotal += item.productId.salePrice * item.quantity;
          totalItems += item.quantity;
        }
      });
    }

    // Calculate shipping cost: ₹60 if subtotal < ₹2000, otherwise ₹0
    const shippingCost = subtotal < 2000 ? 60 : 0;

    res.render('cart', {
      user: userData,
      cart: cart || { items: [] },
      subtotal,
      totalItems,
      shippingCost,
      total: subtotal + shippingCost, // Total including shipping cost
    });
  } catch (error) {
    console.error('Error loading cart page:', error);
    res.redirect('/pageNotFound');
  }
};

const incrementQuantity = async (req, res) => {
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
    console.error('Error incrementing quantity:', error);
    res.status(500).json({ success: false, message: 'Error updating quantity' });
  }
};

const decrementQuantity = async (req, res) => {
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
    console.error('Error decrementing quantity:', error);
    res.status(500).json({ success: false, message: 'Error updating quantity' });
  }
};

const removeItem = async (req, res) => {
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
    console.error('Error removing item:', error);
    res.status(500).json({ success: false, message: 'Error removing item' });
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
}