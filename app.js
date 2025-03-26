const express=require('express')
const app=express()
const env=require('dotenv').config() 
const path=require('path')
const db=require('./config/db')
const PORT=process.env.PORT;
const userRouter=require('./routes/userRouter')
const adminRouter=require('./routes/adminRouter')
db()



app.use(express.json())
app.use(express.urlencoded({extended:true}))


app.set('view engine','ejs')
app.set('views',[
    path.join(__dirname,'views/user'),
    path.join(__dirname,'views/admin')
])
app.use(express.static(path.join(__dirname,'public')))

app.use('/',userRouter)

app.listen(PORT,()=>{
    console.log("server is listening to port 8080")
})
module.exports=app