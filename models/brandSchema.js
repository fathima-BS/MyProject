const mongoose=require('mongoose')
const {Schema}=mongoose
const brandSchema=new Schema({
    BrandName:{
        type:String,
        required:true,
        unique:true
    },
    description:{
        type:String,
        required:true
    },
    isListed:{
        type:Boolean,
        default:true
    },
    brandOffer:{
        type:Number,
        default:0
    },
    createdAt:{
        type:Date,
        default:Date.now
    },
    isDeleted:{
        type:Boolean,
        default:false
    }
})

const Brand=mongoose.model('Brand',brandSchema)
module.exports=Brand
