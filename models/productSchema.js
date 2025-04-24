const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
  productName: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  brand: {
    type: Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  regularPrice: {
    type: Number,
    required: true,
  },
  salePrice: {
    type: Number,
    required: true,
  },
  productOffer: {
    type: Number,
    default: 0,
  },
  quantity: {
    type: Number,
    required: true,
  },
  productImage: {
    type: [String],
    required: true,
  },
  isListed: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['available', 'out of stock', 'Discontinued'],
    required: true,
    default: 'available',
  },
}, {
  timestamps: true
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;