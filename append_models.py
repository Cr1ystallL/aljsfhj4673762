import codecs

with codecs.open(r'd:\Codes\4\112\nehuy\macvbet\mini-app\apps\backend\prisma\schema.prisma', 'a', encoding='utf-8') as f:
    f.write('''
// -----------------------------------------------------------------------------
// Affiliate & RevShare
// -----------------------------------------------------------------------------

model AffiliatePromoCode {
  id        String   @id @default(uuid())
  userId    String   @map("user_id") // ID of the affiliate
  code      String   @unique
  createdAt DateTime @default(now()) @map("created_at")

  @@index([code])
  @@index([userId])
  @@map("affiliate_promo_codes")
}

model AffiliateClick {
  id               String   @id @default(uuid())
  affiliateTelegramId BigInt   @map("affiliate_telegram_id")
  timestamp        DateTime @default(now())

  @@index([affiliateTelegramId])
  @@map("affiliate_clicks")
}

model AffiliateStatsDaily {
  id               String   @id @default(uuid())
  date             DateTime @db.Date
  affiliateTelegramId BigInt   @map("affiliate_telegram_id")
  clicks           Int      @default(0)
  fdCount          Int      @default(0) @map("fd_count")
  rdCount          Int      @default(0) @map("rd_count")
  depSum           Decimal  @default(0) @map("dep_sum") @db.Decimal(20, 2)
  ggr              Decimal  @default(0) @db.Decimal(20, 2)
  ngr              Decimal  @default(0) @db.Decimal(20, 2)
  income           Decimal  @default(0) @db.Decimal(20, 2)

  @@unique([date, affiliateTelegramId])
  @@index([affiliateTelegramId])
  @@map("affiliate_stats_daily")
}
''')
