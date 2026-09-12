const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getUser, getInventory, updateBalance, addItem, removeItem, incrementQuest } = require('../database');
const shopItems = require('../shopItems');
const { resolveItem, formatSuggestions } = require('../resolveItem');
const config = require('../config');

// In-memory trade listings: Map<listingId, { id, sellerId, itemId, qty, price, createdAt, messageId, channelId }>
const listings = new Map();
let nextId = 1;

const TRADE_MAX_ACTIVE = 5; // max active listings per user

// Direct player-to-player offers: Map<offerId, { id, sellerId, buyerId, itemId, qty, price, createdAt, timeoutId }>
const pendingOffers = new Map();
let nextOfferId = 1;
const OFFER_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes
const MIN_OFFER_PRICE = 100; // per item

function offerTotal(offer) {
  return offer.price * offer.qty;
}

function itemById(itemId) {
  return shopItems.find((i) => i.id === itemId);
}

function buildListingEmbed(listing) {
  const item = itemById(listing.itemId);
  const sellerMention = `<@${listing.sellerId}>`;
  const total = listing.price * listing.qty;
  return new EmbedBuilder()
    .setTitle('🔄 Trade Listing')
    .setColor(0x9b59b6)
    .setDescription(
      `**Seller:** ${sellerMention}\n` +
        `**Item:** ${item.emoji} ${item.name}${item.equip ? `\n${statLine(item)}` : ''}\n` +
        `**Quantity:** ${listing.qty}\n` +
        `**Price:** ${listing.price} ${config.currencyName} per item\n` +
        `**Total:** ${total} ${config.currencyName}`
    )
    .setFooter({ text: `Listing #${listing.id}` });
}

function statLine(item) {
  const e = item.equip;
  if (!e) return '';
  const parts = [];
  if (e.attack) parts.push(`🗡️ ATK +${e.attack}`);
  if (e.defense) parts.push(`🛡️ DEF +${e.defense}`);
  if (e.speed) parts.push(`💨 SPD +${e.speed}`);
  if (e.crit) parts.push(`💥 Crit +${e.crit}%`);
  return parts.join(' · ');
}

function buildBuyButton(listingId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade_buy_${listingId}`)
      .setLabel('💰 Buy')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🛒')
  );
}

// Embed describing a direct trade offer.
function buildOfferEmbed(offer) {
  const item = itemById(offer.itemId);
  const total = offerTotal(offer);
  return new EmbedBuilder()
    .setTitle('🤝 Direct Trade Offer')
    .setColor(0x9b59b6)
    .setDescription(
      `**Seller:** <@${offer.sellerId}>\n` +
        `**Buyer:** <@${offer.buyerId}>\n` +
        `${item.emoji} **${item.name}** × ${offer.qty} ${item.equip ? `· ${statLine(item)}\n` : '\n'}` +
        `**Price:** ${offer.price} ${config.currencyName} / item\n` +
        `**Total:** **${total} ${config.currencyName}**\n\n` +
        `⏱️ Offer expires in **2 minutes**.`
    )
    .setFooter({ text: `Offer #${offer.id} · only <@${offer.buyerId}> can accept` });
}

// Accept / decline buttons for a direct offer.
function buildOfferButtons(offerId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade_accept_${offerId}`)
      .setLabel('✅ Terima')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`trade_decline_${offerId}`)
      .setLabel('❌ Tolak')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

// Disable the buttons on a posted offer message (used on accept/decline/expiry).
async function disableOfferMessage(client, offer, content) {
  if (!client || !offer.channelId || !offer.messageId) return;
  try {
    const channel = await client.channels.fetch(offer.channelId);
    const msg = await channel?.messages.fetch(offer.messageId);
    if (msg) {
      await msg.edit({
        embeds: [buildOfferEmbed(offer)],
        components: [buildOfferButtons(offer.id, true)],
        ...(content ? { content } : {}),
      });
    }
  } catch { /* message may be gone */ }
}

// Process an Accept / Decline button on a direct offer. Returns true if handled.
async function handleOfferButton(interaction, offerId, action) {
  try {
    await interaction.deferUpdate();
  } catch (err) {
    console.error('❌ Failed to defer trade offer button:', err);
    return true;
  }

  const offer = pendingOffers.get(offerId);
  if (!offer) {
    await interaction.editReply({ content: '❌ This offer no longer exists (expired or already resolved).' });
    return true;
  }

  // Only the buyer this offer is addressed to may respond.
  if (interaction.user.id !== offer.buyerId) {
    await interaction.editReply({ content: '❌ Only the buyer this offer is addressed to can respond.' });
    return true;
  }

  const item = itemById(offer.itemId);

  if (action === 'decline') {
    clearTimeout(offer.timeoutId);
    pendingOffers.delete(offerId);
    await interaction.editReply({
      content: `❌ <@${offer.buyerId}> **declined** the offer for **${item.emoji} ${item.name} × ${offer.qty}**.`,
      embeds: [buildOfferEmbed(offer)],
      components: [buildOfferButtons(offer.id, true)],
    });
    return true;
  }

  // ---- Accept ----
  const total = offerTotal(offer);

  // Re-check buyer balance and seller stock at acceptance time.
  const buyerRow = await getUser(offer.buyerId);
  const sellerInv = await getInventory(offer.sellerId);
  const owned = sellerInv.find((r) => r.itemId === offer.itemId);

  if (buyerRow.balance < total) {
    clearTimeout(offer.timeoutId);
    pendingOffers.delete(offerId);
    await interaction.editReply({
      content: `⛔ Offer **#${offer.id}** failed — **<@${offer.buyerId}>** didn't have enough ${config.currencyName} (**needed ${total}**).`,
      embeds: [buildOfferEmbed(offer)],
      components: [buildOfferButtons(offer.id, true)],
    });
    return true;
  }

  if (!owned || owned.quantity < offer.qty) {
    clearTimeout(offer.timeoutId);
    pendingOffers.delete(offerId);
    await interaction.editReply({
      content: `⛔ Offer **#${offer.id}** failed — the seller no longer has **${item.name} × ${offer.qty}**.`,
      embeds: [buildOfferEmbed(offer)],
      components: [buildOfferButtons(offer.id, true)],
    });
    return true;
  }

  // Transfer: item seller -> buyer, coins buyer -> seller.
  await removeItem(offer.sellerId, offer.itemId, offer.qty);
  await addItem(offer.buyerId, offer.itemId, offer.qty);
  await updateBalance(offer.buyerId, -total);
  await updateBalance(offer.sellerId, total);
  await incrementQuest(offer.buyerId, 'trade');
  await incrementQuest(offer.sellerId, 'trade');

  clearTimeout(offer.timeoutId);
  pendingOffers.delete(offerId);
  await interaction.editReply({
    content: `✅ <@${offer.buyerId}> **accepted** — bought **${item.emoji} ${item.name} × ${offer.qty}** for **${total} ${config.currencyName}**.`,
    embeds: [buildOfferEmbed(offer)],
    components: [buildOfferButtons(offer.id, true)],
  });
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Sell or buy items between players')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a listing to sell an item')
        .addStringOption((opt) => opt.setName('item').setDescription('Item ID to sell').setRequired(true))
        .addIntegerOption((opt) => opt.setName('price').setDescription('Price per item').setRequired(true))
        .addIntegerOption((opt) => opt.setName('quantity').setDescription('Quantity to sell').setRequired(false))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show all active trade listings'))
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel one of your listings')
        .addIntegerOption((opt) => opt.setName('id').setDescription('Listing ID to cancel').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('offer')
        .setDescription('Offer an item directly to a user (they approve the trade)')
        .addUserOption((opt) => opt.setName('user').setDescription('Buyer / target user to sell to').setRequired(true))
        .addStringOption((opt) => opt.setName('item').setDescription('Item ID to sell').setRequired(true))
        .addIntegerOption((opt) => opt.setName('quantity').setDescription('Quantity to sell (default 1)').setRequired(false))
        .addIntegerOption((opt) => opt.setName('price').setDescription('Price per item, min 100').setRequired(false))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      let itemId = interaction.options.getString('item').toLowerCase();
      const price = interaction.options.getInteger('price');
      const qty = interaction.options.getInteger('quantity') || 1;

      if (price < 1) return interaction.reply({ content: '❌ Price must be at least 1.', flags: 64 });
      if (qty < 1) return interaction.reply({ content: '❌ Quantity must be at least 1.', flags: 64 });

      const item = resolveItem(itemId);
      if (!item) return interaction.reply({ content: `❌ Item **${itemId}** not found.` + formatSuggestions(itemId), flags: 64 });
      itemId = item.id;

      // Prevent trading craft-only locked items? Allow everything except nothing special.
      if (item.category === 'legendary_craft') {
        return interaction.reply({
          content: `❌ **${item.name}** is craft-only and cannot be traded.`,
          flags: 64,
        });
      }

      // Ownership check
      const inv = await getInventory(interaction.user.id);
      const owned = inv.find((r) => r.itemId === itemId);
      if (!owned || owned.quantity < qty) {
        return interaction.reply({ content: `❌ You don't have **${qty}x ${item.name}**.`, flags: 64 });
      }

      // Active listing limit
      const myActive = [...listings.values()].filter((l) => l.sellerId === interaction.user.id).length;
      if (myActive >= TRADE_MAX_ACTIVE) {
        return interaction.reply({
          content: `❌ You already have **${TRADE_MAX_ACTIVE}** active listings. Cancel one first.`,
          flags: 64,
        });
      }

      // Consume item immediately (it's now "listed")
      await removeItem(interaction.user.id, itemId, qty);

      const listing = {
        id: nextId++,
        sellerId: interaction.user.id,
        itemId,
        qty,
        price,
        createdAt: Date.now(),
        messageId: null,
        channelId: interaction.channel?.id || null,
      };
      listings.set(listing.id, listing);

      // Post the listing message
      const embed = buildListingEmbed(listing);
      const msg = await interaction.reply({
        embeds: [embed],
        components: [buildBuyButton(listing.id)],
        fetchReply: true,
      });
      listing.messageId = msg.id;
      if (interaction.channel) listing.channelId = interaction.channel.id;

      return;
    }

    if (sub === 'list') {
      const active = [...listings.values()];
      if (active.length === 0) {
        return interaction.reply({ content: '📭 No active trade listings right now.', flags: 64 });
      }

      const lines = active
        .slice(0, 20)
        .map((l) => {
          const item = itemById(l.itemId);
          return `**#${l.id}** · ${item.emoji} ${item.name} ×${l.qty} — **${l.price * l.qty} ${config.currencyName}** (by <@${l.sellerId}>)`;
        })
        .join('\n');

      const embed = new EmbedBuilder()
        .setTitle('🔄 Active Trades')
        .setColor(0x9b59b6)
        .setDescription(lines)
        .setFooter({ text: `Use /trade buy or click Buy on a listing to purchase` });
      return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    if (sub === 'cancel') {
      const id = interaction.options.getInteger('id');
      const listing = listings.get(id);

      if (!listing || listing.sellerId !== interaction.user.id) {
        return interaction.reply({
          content: `❌ Listing **#${id}** not found or not yours.`,
          flags: 64,
        });
      }

      // Return the item to seller
      await addItem(interaction.user.id, listing.itemId, listing.qty);
      listings.delete(id);

      // Try to disable the posted message's button
      try {
        const channel = await interaction.client.channels.fetch(listing.channelId);
        const msg = await channel?.messages.fetch(listing.messageId);
        if (msg) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`trade_buy_${id}`)
              .setLabel('💰 Sold / Cancelled')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
              .setEmoji('🚫')
          );
          await msg.edit({ components: [row] });
        }
      } catch { /* message may be gone */ }

      return interaction.reply(`✅ Cancelled listing **#${id}** — **${listing.qty}x ${itemById(listing.itemId).name}** returned to your inventory.`);
    }

    if (sub === 'offer') {
      const buyer = interaction.options.getUser('user');
      let itemId = (interaction.options.getString('item') || '').toLowerCase();
      const qty = interaction.options.getInteger('quantity') || 1;
      const price = interaction.options.getInteger('price') || MIN_OFFER_PRICE;

      if (!buyer || buyer.id === interaction.user.id) {
        return interaction.reply({ content: "❌ You can't offer to yourself. Mention another user.", flags: 64 });
      }
      if (qty < 1) return interaction.reply({ content: '❌ Quantity must be at least 1.', flags: 64 });
      if (price < MIN_OFFER_PRICE) {
        return interaction.reply({
          content: `❌ Minimum price is **${MIN_OFFER_PRICE} ${config.currencyName}** per item.`,
          flags: 64,
        });
      }

      const item = resolveItem(itemId);
      if (!item) return interaction.reply({ content: `❌ Item **${itemId}** not found.` + formatSuggestions(itemId), flags: 64 });
      itemId = item.id;
      if (item.category === 'legendary_craft') {
        return interaction.reply({
          content: `❌ **${item.name}** is craft-only and cannot be traded.`,
          flags: 64,
        });
      }

      // Ownership check
      const inv = await getInventory(interaction.user.id);
      const owned = inv.find((r) => r.itemId === itemId);
      if (!owned || owned.quantity < qty) {
        return interaction.reply({ content: `❌ You don't have **${qty}x ${item.name}**.`, flags: 64 });
      }

      // Create the pending offer (item stays with seller until buyer accepts).
      const offer = {
        id: nextOfferId++,
        sellerId: interaction.user.id,
        buyerId: buyer.id,
        itemId,
        qty,
        price,
        createdAt: Date.now(),
        messageId: null,
        channelId: interaction.channel?.id || null,
        timeoutId: null,
      };
      pendingOffers.set(offer.id, offer);

      // Post the offer with accept/decline buttons and ping the buyer.
      let posted;
      try {
        posted = await interaction.reply({
          content: `<@${buyer.id}>`,
          embeds: [buildOfferEmbed(offer)],
          components: [buildOfferButtons(offer.id)],
          fetchReply: true,
        });
      } catch (err) {
        pendingOffers.delete(offer.id);
        throw err;
      }
      offer.messageId = posted?.id;
      if (posted?.channel?.id) offer.channelId = posted.channel.id;

      // Auto-expire after 2 minutes.
      offer.timeoutId = setTimeout(async () => {
        const current = pendingOffers.get(offer.id);
        if (!current) return;
        clearTimeout(current.timeoutId);
        pendingOffers.delete(offer.id);
        await disableOfferMessage(interaction.client, current, `⏱️ Offer **#${offer.id}** to <@${buyer.id}> expired (no response in 2 min).`);
      }, OFFER_EXPIRY_MS);

      return;
    }
  },

  // Called from index.js for the Buy button / offer Accept/Decline buttons
  async handleComponent(interaction) {
    const customId = interaction.customId || '';

    // Direct trade offer buttons (accept / decline).
    if (customId.startsWith('trade_accept_') || customId.startsWith('trade_decline_')) {
      const offerId = parseInt(customId.replace(/^trade_(accept|decline)_/, ''), 10);
      const action = customId.startsWith('trade_accept_') ? 'accept' : 'decline';
      return handleOfferButton(interaction, offerId, action);
    }

    if (!customId.startsWith('trade_buy_')) return false;
    const listingId = parseInt(customId.replace('trade_buy_', ''), 10);
    const listing = listings.get(listingId);

    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error('❌ Failed to defer trade buy:', err);
      return true;
    }

    if (!listing) {
      await interaction.editReply({ content: '❌ This listing is no longer available.', flags: 64 });
      return true;
    }

    if (listing.sellerId === interaction.user.id) {
      await interaction.editReply({ content: '❌ You cannot buy your own listing.', flags: 64 });
      return true;
    }

    const buyer = await getUser(interaction.user.id);
    const total = listing.price * listing.qty;

    if (buyer.balance < total) {
      await interaction.editReply({
        content: `❌ You need **${total} ${config.currencyName}** to buy this. Your balance: **${buyer.balance}**.`,
        flags: 64,
      });
      return true;
    }

    // Transfer: buyer pays, seller receives, item moves
    await updateBalance(interaction.user.id, -total);
    await updateBalance(listing.sellerId, total);
    await addItem(interaction.user.id, listing.itemId, listing.qty);
    await incrementQuest(interaction.user.id, 'trade');
    await incrementQuest(listing.sellerId, 'trade');

    const item = itemById(listing.itemId);
    const sellerMention = `<@${listing.sellerId}>`;

    // Mark listing as sold + disable button
    listings.delete(listingId);
    try {
      const channel = await interaction.client.channels.fetch(listing.channelId);
      const msg = await channel?.messages.fetch(listing.messageId);
      if (msg) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`trade_buy_${listingId}`)
            .setLabel('✅ Sold')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
            .setEmoji('✅')
        );
        await msg.edit({ components: [row], embeds: [buildListingEmbed(listing)] });
      }
    } catch { /* message may be gone */ }

    // Notify the seller privately if possible
    try {
      const seller = await interaction.client.users.fetch(listing.sellerId);
      await seller.send(`🔄 **Sold!** Your listing **${item.emoji} ${item.name} ×${listing.qty}** was bought for **${total} ${config.currencyName}**.`);
    } catch { /* DMs closed */ }

    await interaction.editReply({
      content: `✅ You bought **${listing.qty}x ${item.emoji} ${item.name}** for **${total} ${config.currencyName}**! It was added to your inventory.`,
      flags: 64,
    });
    return true;
  },

  listings,
  buildListingEmbed,
  buildBuyButton,
  pendingOffers,
  buildOfferEmbed,
  buildOfferButtons,
};
