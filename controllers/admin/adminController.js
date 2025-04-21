const User = require('../../models/userSchema')
const bcrypt = require("bcrypt")



const loadlogin = async (req, res) => {
  try {
    if (req.session.message) {
      const message = req.session.message
      req.session.message = null
      return res.render('adminlogin', { message })
    }
    return res.render('adminlogin', { message: '' })
  } catch (error) {
    console.error('error from login admin', error)
  }
}

const login = async (req, res) => {
  console.log(req.body)
  const { email, password } = req.body
  const findadmin = await User.findOne({ isAdmin: true, email: email })
  if (!findadmin) {
    console.log('error')
    req.session.message = "admin not found"
    res.redirect('/admin/login')
  }
  else {
    const passwordMatch = await bcrypt.compare(password, findadmin.password)
    if (passwordMatch) {
      res.render('dashboard')
    }
    else {
      req.session.message = "admin not found"
      res.redirect('/admin/login')
    }
  }
  console.log(findadmin, 'admin')

}


module.exports = {
  loadlogin,
  login
}