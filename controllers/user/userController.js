

const loadHomePage=async(req,res)=>{
     try{
        return res.render('home')
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
module.exports={
    loadHomePage,
    pageNotFound
}