import mongoose from 'mongoose';

/**
 * Schema Mongoose pour les Parametres generaux de la boutique Vicky-Shop.
 * Document unique singleton configurable depuis le Backoffice Administrateur.
 */
const shopSettingsSchema = new mongoose.Schema(
  {
    shopName: {
      type: String,
      default: 'Vicky-Shop',
      trim: true,
    },
    currency: {
      type: String,
      default: 'FCFA',
      trim: true,
    },
    freeShippingThreshold: {
      type: Number,
      default: 50000,
      min: 0,
    },
    defaultShippingCost: {
      type: Number,
      default: 2000,
      min: 0,
    },
    announcementText: {
      type: String,
      default: 'VENTE FLASH : Jusqu\'a -50% | LIVRAISON EXPRESS : 24/48h en Cote d\'Ivoire | PAIEMENT SECURISE : Wave, Orange Money, MTN MoMo | CODE PROMO : VICKY10 (-10%)',
      trim: true,
    },
    activePromoCode: {
      type: String,
      default: 'VICKY10',
      trim: true,
      uppercase: true,
    },
    promoDiscountPercent: {
      type: Number,
      default: 10,
      min: 1,
      max: 90,
    },
    whatsappNumber: {
      type: String,
      default: '2250700000000',
      trim: true,
    },
    isShopOpen: {
      type: Boolean,
      default: true,
    },
    contactEmail: {
      type: String,
      default: 'contact@vickyshop.ci',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Recupere les parametres uniques ou cree le document par defaut s'il n'existe pas.
 */
shopSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export const ShopSettings = mongoose.model('ShopSettings', shopSettingsSchema);
