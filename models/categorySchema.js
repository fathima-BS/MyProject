const mongoose=require('mongoose')
const {Schema}=mongoose
 
const categorySchema=new Schema({
    name:{
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
  
    createdAt:{
        type:Date,
        default:Date.now
    },
    isDeleted:{
        type:Boolean,
        default:false
    }
})
const Category=mongoose.model('Category',categorySchema)

module.exports=Category