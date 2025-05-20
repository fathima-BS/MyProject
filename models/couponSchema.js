const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    couponCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    minimumPrice: {
      type: Number,
      required: true,
      min: [0, 'Minimum cart value must be non-negative']
    },
    offerPrice: {
      type: Number,
      required: true,
      min: [0, 'Offer amount must be non-negative']
    },
    createdOn: {
      type: Date,
      required: true
    },
    expireOn: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return this.createdOn < value;
        },
        message: 'Expire date must be after the created date'
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    userId: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  {
    timestamps: true
  }
);

couponSchema.index({ userId: 1 });

module.exports = mongoose.model('Coupon', couponSchema);