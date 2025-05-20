const express=require('express')
const app=express()
const dotenv=require('dotenv').config() 
const session=require('express-session')
const path=require('path')
const db=require('./config/db')
const PORT=process.env.PORT;
const passport = require('passport')
const setuppassport=require('./config/passport')(passport)
const userRouter=require('./routes/userRouter')
const adminRouter=require('./routes/adminRouter')
const User = require('./models/userSchema')
const { getCartCount } = require('./controllers/user/cartController');
db()
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}))

app.use(async (req, res, next) => {
   const userId = req.session.user; 

   res.locals.user = req.session.user;
   res.locals.cartCount = await getCartCount(userId);

   next();
});




app.use(async (req, res, next) => {
  try {
    res.locals.user = null;
    if (req.session.user) {
      const userData = await User.findById(req.session.user);
      res.locals.user = userData;
    }
    next();
  } catch (err) {
    console.error("Error in global user middleware:", err);
    next();
  }
});

app.use(passport.initialize())
app.use(passport.session())

app.set('view engine','ejs')
app.set('views',[
    path.join(__dirname,'views/user'),
    path.join(__dirname,'views/admin')
])

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*'); 
  }
}));

app.use(express.static(path.join(__dirname,'public')))

app.use((req,res,next)=>{
  res.set('cache-control','no-store')
    next()
})

app.use('/',userRouter)
app.use('/admin', adminRouter)
app.listen(PORT,()=>{
    console.log("server is listening to port 3000")
})
module.exports=app