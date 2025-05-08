const mongoose=require('mongoose')
const {Schema}=mongoose
const userSchema =new Schema({
   username:{
    type:String,
    required: function () {
      return !this.googleId;
    }
   },
   email:{
    type:String,
    required:true,
    unique:true
   },
   dateOfBirth: {
      type: Date,
      required: function () {
         return !this.googleId;
       }
   },
   googleId:{
    type:String,
    unique:false
   },
   password: {
      type: String,
      required: function () {
        return !this.googleId;
      }
    },
   isBlocked:{
    type:Boolean,
    default:false
   },
   isAdmin:{
      type:Boolean,
      default:false
   },
   cart:[{
      type:Schema.Types.ObjectId,
      ref:"Cart"
   }],
   wallet:{
      type:Number,
      default:0
   },
   phone:{
      type:String,
      required:false,
   },
   profileImage: {
      type: String,
      required:false,
    },
   wishlist:[{
      type:Schema.Types.ObjectId,
      ref:"Wishlist"
   }],
   orderHistory:[{
      type:Schema.Types.ObjectId,
      ref:"Order"
   }],
   createdOn:{
      type:Date,
      default:Date.now,
   },
   referalCode:{
      type:String
   },
   redeemed:{
      type:Boolean,
   },
   redeemedUsers:[{
      type:Schema.Types.ObjectId,
      ref:"User"
   }],
   searchHistory:[{
      category:{
         type:Schema.Types.ObjectId,
         ref:"Category"
      },
      brand:{
         type:String
      },
      searchOn:{
         type:Date,
         default:Date.now
      }
   }]
})

const User=mongoose.model('User',userSchema)

module.exports=User