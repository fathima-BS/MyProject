const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  username: {
    type: String,
    required: function () {
      return !this.googleId;
    }
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  dateOfBirth: {
    type: Date,
    required: function () {
      return !this.googleId;
    }
  },
  googleId: {
    type: String,
    unique: false
  },
  password: {
    type: String,
    required: function () {
      return !this.googleId;
    }
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  cart: [{
    type: Schema.Types.ObjectId,
    ref: "Cart"
  }],
  walletBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  phone: {
    type: String,
    required: false
  },
  profileImage: {
    type: String,
    required: false
  },
  orderHistory: [{
    type: Schema.Types.ObjectId,
    ref: "Order"
  }],
  createdOn: {
    type: Date,
    default: Date.now
  },
  referralCode: {
    type: String,
    unique: true,
    required: false
  },
  redeemed: {
    type: Boolean,
    default: false
  },
  redeemedUsers: [{
    type: Schema.Types.ObjectId,
    ref: "User"
  }],
  walletTransactions: [{
    type: Schema.Types.ObjectId,
    ref: 'WalletTransaction'
  }],
  searchHistory: [{
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category"
    },
    brand: {
      type: String
    },
    searchOn: {
      type: Date,
      default: Date.now
    }
  }]
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;