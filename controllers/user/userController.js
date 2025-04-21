const User=require('../../models/userSchema')
const nodemailer= require('nodemailer')
const bcrypt=require("bcrypt")
const loadHomePage=async(req,res)=>{
     try{
       const user=req.session.user
       if(user){
        const userData=await User.findOne({_id:user});
        res.render('home',{user:userData})
       }else{
        return res.render('home',{user:null})
       }
     }catch(err){
       console.log('Home page not found',err.message)
       res.status(500).send('server error')
     }
}

const pageNotFound=async(req,res)=>{
  try{
    res.render('page404')
  }catch(err){
    res.redirect('/pageNotFound')
  }
}
const loadSignup=async(req,res)=>{
  try{
    return res.render('signup',{message:null})
  }catch(err){
   console.log("Home page not loading: ",err.message);
   res.status(500).send('Server Error')
  }
}


const loadLogin=async(req,res)=>{
  try{
    if(!req.session.user){
      return res.render('login',{message:null})
    }else{
      res.redirect('/')
    }
    
  }catch(err){
    res.redirect('/pageNotFound')
  }
}


function generateOtp(){
  return Math.floor(100000+ Math.random()*900000).toString()
}

async function sendVerificationEmail(email,otp){
   try {
     const transporter= nodemailer.createTransport({
      service:'gmail',
      port:587,
      secure:false,
      requireTLS:true,
      auth:{
        user:process.env.NODEMAILER_EMAIL,
        pass:process.env.NODEMAILER_PASSWORD
      }
     })
    const info=await transporter.sendMail({
      from:process.env.NODEMAILER_EMAIL,
      to:email,
      subject:"Verify your account",
      text:`Your OTP is ${otp}`,
      html:`<b>Your OTP: ${otp}</b>`
    })
    return info.accepted.length>0
   } catch (error) {
    console.error("Error sending email",error)
    return false
   }
}

const signup=async(req,res)=>{
  try{
    console.log(req.body);
    const {username,dateOfBirth,email,password,cPassword }=req.body
    if(!password && !cPassword){
      return res.render("signup", {message: "Password is required"})
    }
    if(password!==cPassword){
      return res.render("signup",{message:"Passwords do not match"})
    }
     const findUser=await User.findOne({email})
          
     if(findUser){
      return res.render("signup",{message:"User with this email already exits"})
     }

     const otp=generateOtp()
     const emailSent=await sendVerificationEmail(email,otp)
     if(!emailSent){
        return res.json("email-error")
     }
     req.session.userOtp=otp
     req.session.userData={username,dateOfBirth,email,password}
     res.render("verifyOtp")
     console.log("OTP Sent",otp)
  }catch(err){
     console.error("signup error",err)
     res.redirect("/pageNotFound")
  }
}

const securePassword=async(password)=>{
  try{
    const passwordHash=await bcrypt.hash(password,10)
    return passwordHash
  }catch(error){

  }
}

const verifyOtp = async (req, res) => {
  try {
    const {otp}=req.body
    if(otp===req.session.userOtp){
      const user=req.session.userData
      const passwordHash=await securePassword(user.password)
      const saveUserData=new User({
        username:user.username,
        email:user.email,
        dateOfBirth:user.dateOfBirth,
        password:passwordHash
      })
      await saveUserData.save()
      req.session.user=saveUserData._id
      delete req.session.userOtp;
      delete req.session.userData

      res.json({success:true,redirectUrl:"/login"})
    }else{
      res.status(400).json({success:false,message:"Invalid OTP, Please try again"})
    }
    
  } catch (error) {
    console.error("Error Verifying OTP",error)
    res.status(500).json({success:false,message:"An error occured"})
  }
}

const resendOtp=async(req,res)=>{
  try {
    const {email}=req.session.userData
    if(!email){
      return res.status(400).json({success:false,message:"Email not found in session"})
    }
    const otp=generateOtp()
    req.session.userOtp=otp
    const emailSent=await sendVerificationEmail(email,otp)
    if(emailSent){
      console.log("Resend OTP:",otp);
      res.status(200).json({success:true,message:"OTP resend Successfully"})
    }else{
      res.status(500).json({success:false,message:"Failed to resend OTP. Please try again"})
    }
  } catch (error) {
    console.error("Error resending OTP",error)
    res.status(500).json({success:false,message:"Internal server error. Please try again."})
  }
}

const login=async(req,res)=>{
   try {
    const {email,password}=req.body
    const findUser=await User.findOne({isAdmin:0,email:email})

    if(!findUser){
      return res.render("login",{message:"User not found"})
    }
    if(findUser.isBlocked){
      return res.render('login',{message:'User is blocked by admin'})
    }

    const passwordMatch=await bcrypt.compare(password,findUser.password)
    if(!passwordMatch){
      return res.render('login',{message:'Incorrect Password'})
    }
    req.session.user=findUser._id
    res.redirect('/')

   } catch (error) {
    console.error('login error',error)
    res.render('login',{message:'login failed.Please try again later'})
   }
}

module.exports={
    loadHomePage,
    pageNotFound,
    loadSignup,
    loadLogin,
    signup,
    verifyOtp,
    resendOtp,
    login
}