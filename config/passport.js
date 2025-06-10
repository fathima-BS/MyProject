const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const Wallet = require('../models/walletSchema');

async function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'WLT';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const existingUser = await User.findOne({ referralCode: result });
  if (existingUser) {
    return generateReferralCode();
  }
  return result;
}

function generateTransactionId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'WLT';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = function (passport) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://cario.shop/auth/google/callback",
    passReqToCallback: true
  },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id }) || await User.findOne({ email: profile.emails[0].value });
        let referralCode = user?.referralCode || await generateReferralCode();

        const referralCodeFromSession = req.session?.referralCode || req.query?.ref;
        if (referralCodeFromSession && !user) {
          req.session.referralCode = referralCodeFromSession;
        }

        if (user) {
          if (user.isBlocked) {
            return done(null, false, { message: 'Account is Blocked' });
          }
          if (!user.googleId) {
            user.googleId = profile.id;
          }
          if (!user.referralCode) {
            user.referralCode = referralCode;
            await user.save();
            console.log('Assigned referral code to existing user:', user.email, referralCode);
          }
          return done(null, user);
        }

        // Create new user
        user = new User({
          googleId: profile.id,
          username: profile.displayName || profile.emails[0].value.split('@')[0],
          email: profile.emails[0].value,
          referralCode,
          walletBalance: req.session.referralCode ? 500 : 0,
          isAdmin: false,
          createdOn: new Date()
        });

        if (req.session.referralCode) {
          const referrer = await User.findOne({ referralCode: req.session.referralCode });
          if (referrer && !referrer.isBlocked) {
            let referrerWallet = await Wallet.findOne({ userId: referrer._id });
            if (!referrerWallet) {
              referrerWallet = new Wallet({
                userId: referrer._id,
                balance: 0,
                transactions: [],
              });
            }

            referrerWallet.balance += 1000;
            referrerWallet.transactions.push({
              amount: 1000,
              type: 'credit',
              description: `Referral bonus for referring ${user.email}`,
              date: new Date(),
            });

            referrer.redeemedUsers.push(user._id);
            await Promise.all([referrer.save(), referrerWallet.save()]);

            console.log('Referrer bonus applied:', referrer.email);

            let newUserWallet = await Wallet.findOne({ userId: user._id });
            if (!newUserWallet) {
              newUserWallet = new Wallet({
                userId: user._id,
                balance: 0,
                transactions: [],
              });
            }

            newUserWallet.balance += 500;
            newUserWallet.transactions.push({
              amount: 500,
              type: 'credit',
              description: `Referral bonus for using referral code ${req.session.referralCode}`,
              date: new Date(),
            });

            await newUserWallet.save();
            delete req.session.referralCode;

            console.log('New user bonus applied:', user.email);
          } else {
            console.log('Invalid or blocked referrer for code:', req.session.referralCode);
          }
        }

        await user.save();
        console.log('Created Google user:', user.email, 'Referral Code:', user.referralCode);
        return done(null, user);

      } catch (error) {
        console.error('Google auth error:', error);
        return done(error, null);
      }
    }
  ));

  passport.serializeUser((user, done) => done(null, user._id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};
