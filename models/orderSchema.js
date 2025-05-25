const mongoose = require('mongoose');
const { Schema } = mongoose;
const Product = require('./productSchema');

const orderedItemSchema = new Schema({
    product: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    price: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Return Request', 'Returned', 'Return Rejected']
    },
    returnRejectReason: {
        type: String
    }
});

const orderSchema = new Schema({
    orderId: {
        type: String,
        unique: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    orderedItems: [orderedItemSchema],
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        addressType: { type: String },
        name: { type: String },
        city: { type: String },
        landMark: { type: String },
        State: { type: String },
        pincode: { type: Number },
        phone: { type: String }
    },
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Return Request', 'Returned', 'Return Rejected']
    },
    paymentMethod: {
        type: String,
        required: true
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    couponCode: { 
        type: String,
        default: null
    },
    shippingCost: {
        type: Number,
        required: true
    },
    returnRejectReason: {
        type: String
    }
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;