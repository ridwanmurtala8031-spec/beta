import { users, wallets, signals, trades, userLanes, groupBindings, userSubscriptions, userPremiums, admins } from "../shared/schema";
import type { 
  User, InsertUser, 
  Wallet, InsertWallet, 
  Signal, InsertSignal, 
  Trade, InsertTrade, 
  UserLane, InsertUserLane,
  GroupBinding, InsertGroupBinding
  , InsertUserSubscription, UserSubscription
} from "../shared/schema";
import { db } from "./db";
import { eq, desc, and, or } from "drizzle-orm";
import crypto from "crypto";
import { backupToSupabase } from './restore';
import { log } from "./index";

function getMasterKey(): string | undefined {
  return process.env.SESSION_SECRET;
}

const ALGORITHM = "aes-256-cbc";

function encrypt(text: string): string {
  const MASTER_KEY = getMasterKey();
  if (!MASTER_KEY) throw new Error("Encryption failed: SESSION_SECRET missing");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(MASTER_KEY.padEnd(32).slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text: string): string {
  const MASTER_KEY = getMasterKey();
  if (!MASTER_KEY) return text;
  try {
    const textParts = text.split(":");
    if (textParts.length < 2) return text;
    const iv = Buffer.from(textParts.shift()!, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(MASTER_KEY.padEnd(32).slice(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    return text;
  }
}

// In-memory storage for signals to reduce SQLite load
let memorySignals: Signal[] = [];
const MAX_MEMORY_SIGNALS = 100;

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  getUserLanes(userId: string): Promise<UserLane[]>;
  upsertUserLane(lane: InsertUserLane): Promise<UserLane>;
  getGroupBinding(groupId: string, topicId?: string): Promise<GroupBinding | undefined>;
  getGroupBindings(groupId: string): Promise<GroupBinding[]>;
  upsertGroupBinding(binding: InsertGroupBinding): Promise<GroupBinding>;
  getUserSubscriptions(userId: string): Promise<UserSubscription[]>;
  getUserPremium(userId: string): Promise<any | undefined>;
  upsertUserPremium(sub: { userId: string; tier: string; expiresAt: number }): Promise<any>;
  isAdmin(userId: string): Promise<boolean>;
  addAdmin(userId: string, isOwner?: boolean): Promise<void>;
  removeAdmin(userId: string): Promise<void>;
  incrementDailyUsage(userId: string, type: 'analyze' | 'other'): Promise<void>;
  resetDailyUsageIfNeeded(userId: string): Promise<void>;
  upsertUserSubscription(sub: InsertUserSubscription): Promise<UserSubscription>;
  deleteUserSubscription(userId: string, groupId: string, topicId?: string, lane?: string): Promise<void>;
  getSubscribersForBinding(groupId: string, topicId: string | undefined, lane: string): Promise<User[]>;
  getWallets(userId: string): Promise<Wallet[]>;
  getWallet(id: number): Promise<Wallet | undefined>;
  updateWalletBalance(id: number, balance: string): Promise<Wallet>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  deleteWallet(id: number): Promise<void>;
  setActiveWallet(userId: string, walletId: number): Promise<void>;
  getActiveWallet(userId: string): Promise<Wallet | undefined>;
  getSignals(): Promise<Signal[]>;
  getSignal(id: number): Promise<Signal | undefined>;
  createSignal(signal: any): Promise<Signal>;
  updateSignal(id: number, data: Partial<Signal>): Promise<void>;
  getTrades(userId: string): Promise<Trade[]>;
  createTrade(insertTrade: InsertTrade): Promise<Trade>;
  updateTrade(id: number, data: Partial<Trade>): Promise<Trade>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(insertUser: any): Promise<User> {
    const now = Date.now();
    const dataToSet = { ...insertUser, lastActive: now };
    const [user] = await db.insert(users).values(dataToSet).onConflictDoUpdate({
      target: users.id,
      set: dataToSet
    }).returning();
    backupToSupabase().catch((err: any) => log(`Async backup failed: ${err.message}`, "backup"));
    return user as User;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set({ ...data, lastActive: Date.now() }).where(eq(users.id, id)).returning();
    if (!user) return this.upsertUser({ id, ...data });
    return user as User;
  }

  async getUserLanes(userId: string): Promise<UserLane[]> {
    return db.select().from(userLanes).where(eq(userLanes.userId, userId)) as any;
  }

  async isAdmin(userId: string): Promise<boolean> {
    const [a] = await db.select().from(admins).where(eq((admins as any).userId, userId));
    return !!a;
  }

  async addAdmin(userId: string, isOwner: boolean = false): Promise<void> {
    const now = Date.now();
    const [existing] = await db.select().from(admins).where(eq((admins as any).userId, userId));
    if (existing) {
      await db.update(admins).set({ isOwner: isOwner ? true : false }).where(eq((admins as any).id, existing.id));
      return;
    }
    await db.insert(admins).values({ userId, isOwner: isOwner ? true : false, createdAt: now });
  }

  async removeAdmin(userId: string): Promise<void> {
    await db.delete(admins).where(eq((admins as any).userId, userId));
  }

  async upsertUserLane(insertLane: InsertUserLane): Promise<UserLane> {
    try {
      const [lane] = await db.insert(userLanes).values(insertLane).onConflictDoUpdate({
        target: [userLanes.userId, userLanes.lane],
        set: { enabled: insertLane.enabled }
      }).returning();
      return lane as UserLane;
    } catch (error: any) {
      const [existing] = await db.select().from(userLanes).where(
        and(eq(userLanes.userId, insertLane.userId), eq(userLanes.lane, insertLane.lane))
      );
      if (existing) {
        const [updated] = await db.update(userLanes).set({ enabled: insertLane.enabled }).where(eq(userLanes.id, existing.id)).returning();
        return updated as UserLane;
      }
      const [created] = await db.insert(userLanes).values(insertLane).returning();
      return created as UserLane;
    }
  }

  async getGroupBinding(groupId: string, topicId?: string): Promise<GroupBinding | undefined> {
    const conditions = [eq(groupBindings.groupId, groupId)];
    if (topicId) conditions.push(eq(groupBindings.topicId, topicId));
    const [binding] = await db.select().from(groupBindings).where(and(...conditions));
    return binding as GroupBinding | undefined;
  }

  async getGroupBindings(groupId: string): Promise<GroupBinding[]> {
    return db.select().from(groupBindings).where(eq(groupBindings.groupId, groupId)) as any;
  }

  async getUserSubscriptions(userId: string): Promise<UserSubscription[]> {
    return db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)) as any;
  }

  async getUserPremium(userId: string): Promise<any | undefined> {
    const [p] = await db.select().from((global as any).userPremiums || (userPremiums as any)).where(eq((userPremiums as any).userId, userId));
    return p as any;
  }

  async upsertUserPremium(sub: { userId: string; tier: string; expiresAt: number }): Promise<any> {
    try {
      const now = Date.now();
      const [existing] = await db.select().from(userPremiums).where(eq(userPremiums.userId, sub.userId));
      if (existing) {
        const [updated] = await db.update(userPremiums).set({ tier: sub.tier, expiresAt: sub.expiresAt }).where(eq(userPremiums.id, existing.id)).returning();
        return updated as any;
      }
      const [created] = await db.insert(userPremiums).values({ userId: sub.userId, tier: sub.tier, expiresAt: sub.expiresAt, createdAt: now, lastUsageReset: now }).returning();
      return created as any;
    } catch (e: any) {
      throw e;
    }
  }

  async incrementDailyUsage(userId: string, type: 'analyze' | 'other'): Promise<void> {
    const [p] = await db.select().from(userPremiums).where(eq(userPremiums.userId, userId));
    if (!p) return;
    const now = Date.now();
    const lastReset = p.lastUsageReset || p.createdAt || now;
    if (now - lastReset > 24 * 60 * 60 * 1000) {
      await db.update(userPremiums).set({ dailyAnalyzeUsage: 0, dailyOtherUsage: 0, lastUsageReset: now }).where(eq(userPremiums.id, p.id));
    }
    if (type === 'analyze') {
      await db.update(userPremiums).set({ dailyAnalyzeUsage: (p.dailyAnalyzeUsage || 0) + 1 }).where(eq(userPremiums.id, p.id));
    } else {
      await db.update(userPremiums).set({ dailyOtherUsage: (p.dailyOtherUsage || 0) + 1 }).where(eq(userPremiums.id, p.id));
    }
  }

  async resetDailyUsageIfNeeded(userId: string): Promise<void> {
    const [p] = await db.select().from(userPremiums).where(eq(userPremiums.userId, userId));
    if (!p) return;
    const now = Date.now();
    const lastReset = p.lastUsageReset || p.createdAt || now;
    if (now - lastReset > 24 * 60 * 60 * 1000) {
      await db.update(userPremiums).set({ dailyAnalyzeUsage: 0, dailyOtherUsage: 0, lastUsageReset: now }).where(eq(userPremiums.id, p.id));
    }
  }

  async upsertUserSubscription(sub: InsertUserSubscription): Promise<UserSubscription> {
    const conditions: any[] = [eq(userSubscriptions.userId, sub.userId), eq(userSubscriptions.groupId, sub.groupId), eq(userSubscriptions.lane, sub.lane)];
    if (sub.topicId) conditions.push(eq(userSubscriptions.topicId, sub.topicId));
    const [existing] = await db.select().from(userSubscriptions).where(and(...conditions));
    if (existing) {
      const [updated] = await db.update(userSubscriptions).set({ enabled: sub.enabled }).where(eq(userSubscriptions.id, existing.id)).returning();
      return updated as UserSubscription;
    }
    const values = { ...sub, createdAt: (sub as any).createdAt || Date.now() } as any;
    const [created] = await db.insert(userSubscriptions).values(values).returning();
    return created as UserSubscription;
  }

  async deleteUserSubscription(userId: string, groupId: string, topicId?: string, lane?: string): Promise<void> {
    const conditions: any[] = [eq(userSubscriptions.userId, userId), eq(userSubscriptions.groupId, groupId)];
    if (topicId) conditions.push(eq(userSubscriptions.topicId, topicId));
    if (lane) conditions.push(eq(userSubscriptions.lane, lane));
    await db.delete(userSubscriptions).where(and(...conditions));
  }

  async getSubscribersForBinding(groupId: string, topicId: string | undefined, lane: string): Promise<User[]> {
    const conditions: any[] = [eq(userSubscriptions.groupId, groupId), eq(userSubscriptions.lane, lane), eq(userSubscriptions.enabled, true)];
    if (topicId) conditions.push(eq(userSubscriptions.topicId, topicId));
    const results = await db.select().from(userSubscriptions).innerJoin(users, eq(userSubscriptions.userId, users.id)).where(and(...conditions));
    return results.map((r: any) => r.users) as any;
  }

  async upsertGroupBinding(insertBinding: InsertGroupBinding): Promise<GroupBinding> {
    const conditions = [eq(groupBindings.groupId, insertBinding.groupId)];
    if (insertBinding.topicId) conditions.push(eq(groupBindings.topicId, insertBinding.topicId));
    const [existing] = await db.select().from(groupBindings).where(and(...conditions));
    if (existing) {
      const [updated] = await db.update(groupBindings).set({ lane: insertBinding.lane }).where(eq(groupBindings.id, existing.id)).returning();
      return updated as GroupBinding;
    }
    const values = { ...insertBinding, createdAt: (insertBinding as any).createdAt || Date.now() } as any;
    const [created] = await db.insert(groupBindings).values(values).returning();
    return created as GroupBinding;
  }

  async getWallets(userId: string): Promise<Wallet[]> {
    const results = await db.select().from(wallets).where(eq(wallets.userId, userId)).orderBy(desc(wallets.isActive), desc(wallets.createdAt));
    return results.map((w: any) => ({ ...w, privateKey: decrypt(w.privateKey) })) as any;
  }

  async setActiveWallet(userId: string, walletId: number): Promise<void> {
    const [wallet] = await db.select().from(wallets).where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));
    if (!wallet) throw new Error("Wallet not found");
    await db.update(wallets).set({ isActive: false }).where(eq(wallets.userId, userId));
    await db.update(wallets).set({ isActive: true }).where(eq(wallets.id, walletId));
  }

  async getActiveWallet(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.isActive, true)));
    if (wallet) return { ...wallet, privateKey: decrypt(wallet.privateKey) } as Wallet;
    const [firstWallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).orderBy(desc(wallets.createdAt)).limit(1);
    if (firstWallet) return { ...firstWallet, privateKey: decrypt(firstWallet.privateKey) } as Wallet;
    return undefined;
  }

  async getWallet(id: number): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id));
    if (wallet) return { ...wallet, privateKey: decrypt(wallet.privateKey) } as Wallet;
    return undefined;
  }

  async updateWalletBalance(id: number, balance: string): Promise<Wallet> {
    const [wallet] = await db.update(wallets).set({ balance }).where(eq(wallets.id, id)).returning();
    if (!wallet) throw new Error("Wallet not found");
    return { ...wallet, privateKey: decrypt(wallet.privateKey) } as Wallet;
  }

  async createWallet(insertWallet: InsertWallet): Promise<Wallet> {
    const values = { ...insertWallet, privateKey: encrypt(insertWallet.privateKey), createdAt: (insertWallet as any).createdAt || Date.now() } as any;
    const [wallet] = await db.insert(wallets).values(values).returning();
    backupToSupabase().catch((err: any) => log(`Async backup failed: ${err.message}`, "backup"));
    return { ...wallet, privateKey: decrypt(wallet.privateKey) } as Wallet;
  }

  async deleteWallet(id: number): Promise<void> {
    await db.delete(wallets).where(eq(wallets.id, id));
  }

  async getSignals(): Promise<Signal[]> {
    return [...memorySignals].sort((a, b) => {
      const aTime = (a as any).createdAt instanceof Date ? (a as any).createdAt.getTime() : (typeof (a as any).createdAt === 'number' ? (a as any).createdAt : 0);
      const bTime = (b as any).createdAt instanceof Date ? (b as any).createdAt.getTime() : (typeof (b as any).createdAt === 'number' ? (b as any).createdAt : 0);
      return bTime - aTime;
    });
  }

  async getSignal(id: number): Promise<Signal | undefined> {
    return memorySignals.find(s => s.id === id);
  }

  async createSignal(insertSignal: InsertSignal): Promise<Signal> {
    const newSignal: Signal = {
      ...insertSignal,
      id: Date.now(),
      createdAt: Date.now(),
      lastUpdateAt: Date.now(),
      data: typeof insertSignal.data === 'string' ? insertSignal.data : JSON.stringify(insertSignal.data || {})
    } as any;
    memorySignals.push(newSignal);
    if (memorySignals.length > MAX_MEMORY_SIGNALS) memorySignals.shift();
    return newSignal;
  }

  async updateSignal(id: number, data: Partial<Signal>): Promise<void> {
    const idx = memorySignals.findIndex(s => s.id === id);
    if (idx !== -1) {
      memorySignals[idx] = { ...memorySignals[idx], ...data, lastUpdateAt: Date.now() } as any;
    }
  }

  async getTrades(userId: string): Promise<Trade[]> {
    return db.select().from(trades).where(eq(trades.userId, userId)).orderBy(desc(trades.createdAt)) as any;
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const values = { ...insertTrade, createdAt: (insertTrade as any).createdAt || Date.now() } as any;
    const [trade] = await db.insert(trades).values(values).returning();
    return trade as Trade;
  }

  async updateTrade(id: number, data: Partial<Trade>): Promise<Trade> {
    const [trade] = await db.update(trades).set(data).where(eq(trades.id, id)).returning();
    if (!trade) throw new Error("Trade not found");
    return trade as Trade;
  }
}

export const storage = new DatabaseStorage();
