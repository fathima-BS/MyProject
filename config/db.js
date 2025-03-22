const mongoose=require('mongoose')
const env=require('dotenv').config()

const connectDB=async()=>{
    try{
       await mongoose.connect(process.env.MONGODB_URL)
       console.log("connected to DB")
    }catch(err){
       console.log("Db connection error",err.message)
       process.exit(1)
    }
}

module.exports=connectDB