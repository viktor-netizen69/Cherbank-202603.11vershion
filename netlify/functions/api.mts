import type { Config } from "@netlify/functions";
import { eq, desc, ilike, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, transactions, bankSettings } from "../../db/schema.js";

const DEFAULT_SETTINGS = {
  id: "default",
  transferFeePercent: 3,
  loanRatePercent: 10,
  loanMaxAmount: 50000,
  loanMaxTermDays: 7,
  loanPenaltyAmount: 1000,
  depositRatePercent: 5,
  depositTermDays: 3,
};

function generateCardNumber() {
  const p1 = "4276";
  const p2 = Math.floor(1000 + Math.random() * 9000);
  const p3 = Math.floor(1000 + Math.random() * 9000);
  const p4 = Math.floor(1000 + Math.random() * 9000);
  return `${p1} ${p2} ${p3} ${p4}`;
}

async function getOrCreateSettings() {
  const existing = await db
    .select()
    .from(bankSettings)
    .where(eq(bankSettings.id, "default"))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [inserted] = await db
    .insert(bankSettings)
    .values(DEFAULT_SETTINGS)
    .returning();

  return inserted;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "");
  const method = req.method;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // 1. SYNC: Fetch all data from database
    if (path === "/sync" && method === "GET") {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      const allTx = await db
        .select()
        .from(transactions)
        .orderBy(desc(transactions.createdAt));
      const currentSettings = await getOrCreateSettings();

      const formattedUsers = allUsers.map((u) => ({
        id: u.id,
        username: u.username,
        password: u.password,
        cardNumber: u.cardNumber,
        balance: u.balance,
        isFrozen: u.isFrozen,
        isAdmin: u.isAdmin,
        isVerified: u.isVerified,
        hasCherPlus: u.hasCherPlus,
        cardSkin: u.cardSkin,
        bioUrl: u.bioUrl || "",
        activeLoan: u.activeLoan,
        activeDeposit: u.activeDeposit,
        createdAt: u.createdAt ? u.createdAt.toISOString() : new Date().toISOString(),
      }));

      const formattedTx = allTx.map((t) => ({
        id: t.id,
        from: t.fromUser,
        to: t.toUser,
        amount: t.amount,
        fee: t.fee,
        comment: t.comment,
        date: t.date,
      }));

      const formattedSettings = {
        transferFeePercent: currentSettings.transferFeePercent,
        loanRatePercent: currentSettings.loanRatePercent,
        loanMaxAmount: currentSettings.loanMaxAmount,
        loanMaxTermDays: currentSettings.loanMaxTermDays,
        loanPenaltyAmount: currentSettings.loanPenaltyAmount,
        depositRatePercent: currentSettings.depositRatePercent,
        depositTermDays: currentSettings.depositTermDays,
      };

      return Response.json(
        {
          users: formattedUsers,
          transactions: formattedTx,
          settings: formattedSettings,
        },
        { headers: corsHeaders }
      );
    }

    // 2. REGISTER
    if (path === "/register" && method === "POST") {
      const { username, password } = await req.json();
      const uTrim = (username || "").trim();
      const pTrim = (password || "").trim();

      if (!uTrim || uTrim.length < 2) {
        return Response.json(
          { error: "Никнейм должен содержать минимум 2 символа" },
          { status: 400, headers: corsHeaders }
        );
      }

      const existing = await db
        .select()
        .from(users)
        .where(ilike(users.username, uTrim))
        .limit(1);

      if (existing.length > 0) {
        return Response.json(
          { error: "Данный никнейм уже занят" },
          { status: 400, headers: corsHeaders }
        );
      }

      const isAdminRole = uTrim.toLowerCase() === "admin";
      const newUser = {
        id: "USR-" + Math.floor(1000 + Math.random() * 9000),
        username: uTrim,
        password: pTrim,
        cardNumber: generateCardNumber(),
        balance: isAdminRole ? 100000 : 1000,
        isFrozen: false,
        isAdmin: isAdminRole,
        isVerified: isAdminRole,
        hasCherPlus: isAdminRole,
        cardSkin: isAdminRole ? "gold" : "default",
        bioUrl: "",
        activeLoan: null,
        activeDeposit: null,
      };

      const [created] = await db.insert(users).values(newUser).returning();

      return Response.json({ success: true, user: created }, { headers: corsHeaders });
    }

    // 3. LOGIN
    if (path === "/login" && method === "POST") {
      const { username, password } = await req.json();
      const uTrim = (username || "").trim();
      const pTrim = (password || "").trim();

      const found = await db
        .select()
        .from(users)
        .where(ilike(users.username, uTrim))
        .limit(1);

      if (found.length === 0) {
        return Response.json(
          { error: "Пользователь с таким никнеймом не найден" },
          { status: 404, headers: corsHeaders }
        );
      }

      const user = found[0];
      if (user.password !== pTrim) {
        return Response.json(
          { error: "Неверный пароль" },
          { status: 401, headers: corsHeaders }
        );
      }

      return Response.json({ success: true, user }, { headers: corsHeaders });
    }

    // 4. TRANSFER
    if (path === "/transfer" && method === "POST") {
      const { fromUsername, target, amount, comment } = await req.json();
      const numAmount = parseInt(amount, 10);

      if (!numAmount || numAmount <= 0) {
        return Response.json(
          { error: "Некорректная сумма перевода" },
          { status: 400, headers: corsHeaders }
        );
      }

      const senderList = await db
        .select()
        .from(users)
        .where(ilike(users.username, fromUsername))
        .limit(1);

      if (senderList.length === 0) {
        return Response.json(
          { error: "Отправитель не найден" },
          { status: 404, headers: corsHeaders }
        );
      }

      const sender = senderList[0];
      if (sender.isFrozen) {
        return Response.json(
          { error: "Ваш счёт заморожен Службой Безопасности Черьбанка" },
          { status: 403, headers: corsHeaders }
        );
      }

      const targetTrim = (target || "").trim();
      const recipientList = await db
        .select()
        .from(users)
        .where(
          or(
            ilike(users.username, targetTrim),
            eq(users.cardNumber, targetTrim)
          )
        )
        .limit(1);

      if (recipientList.length === 0) {
        return Response.json(
          { error: "Получатель с таким ником или картой не найден" },
          { status: 404, headers: corsHeaders }
        );
      }

      const recipient = recipientList[0];
      if (recipient.id === sender.id) {
        return Response.json(
          { error: "Нельзя переводить средства самому себе" },
          { status: 400, headers: corsHeaders }
        );
      }

      const currentSettings = await getOrCreateSettings();
      const feePercent = sender.hasCherPlus ? 0 : currentSettings.transferFeePercent;
      const fee = Math.round((numAmount * feePercent) / 100);
      const totalDeduct = numAmount + fee;

      if (sender.balance < totalDeduct) {
        return Response.json(
          { error: `Недостаточно средств. Требуется $${totalDeduct.toLocaleString()}` },
          { status: 400, headers: corsHeaders }
        );
      }

      // Update balances
      await db
        .update(users)
        .set({ balance: sender.balance - totalDeduct })
        .where(eq(users.id, sender.id));

      await db
        .update(users)
        .set({ balance: recipient.balance + numAmount })
        .where(eq(users.id, recipient.id));

      const txRecord = {
        id: "TX-" + Math.floor(1000 + Math.random() * 9000),
        fromUser: sender.username,
        toUser: recipient.username,
        amount: numAmount,
        fee: fee,
        comment: (comment || "").trim(),
        date: new Date().toLocaleString("ru-RU"),
      };

      await db.insert(transactions).values(txRecord);

      return Response.json(
        {
          success: true,
          tx: txRecord,
          senderNewBalance: sender.balance - totalDeduct,
        },
        { headers: corsHeaders }
      );
    }

    // 5. UPDATE USER STATE (e.g. loan, deposit, skin, bio, freeze, verify)
    if (path === "/user/update" && method === "POST") {
      const { username, updates } = await req.json();

      const userList = await db
        .select()
        .from(users)
        .where(ilike(users.username, username))
        .limit(1);

      if (userList.length === 0) {
        return Response.json(
          { error: "Пользователь не найден" },
          { status: 404, headers: corsHeaders }
        );
      }

      const user = userList[0];
      const validUpdates: Record<string, any> = {};

      if (typeof updates.balance === "number") validUpdates.balance = updates.balance;
      if (typeof updates.isFrozen === "boolean") validUpdates.isFrozen = updates.isFrozen;
      if (typeof updates.isVerified === "boolean") validUpdates.isVerified = updates.isVerified;
      if (typeof updates.hasCherPlus === "boolean") validUpdates.hasCherPlus = updates.hasCherPlus;
      if (typeof updates.cardSkin === "string") validUpdates.cardSkin = updates.cardSkin;
      if (typeof updates.bioUrl === "string") validUpdates.bioUrl = updates.bioUrl;
      if (updates.activeLoan !== undefined) validUpdates.activeLoan = updates.activeLoan;
      if (updates.activeDeposit !== undefined) validUpdates.activeDeposit = updates.activeDeposit;

      const [updatedUser] = await db
        .update(users)
        .set(validUpdates)
        .where(eq(users.id, user.id))
        .returning();

      return Response.json({ success: true, user: updatedUser }, { headers: corsHeaders });
    }

    // 6. RECORD TRANSACTION
    if (path === "/transaction" && method === "POST") {
      const { id, fromUser, toUser, amount, fee, comment, date } = await req.json();

      const newTx = {
        id: id || "TX-" + Math.floor(1000 + Math.random() * 9000),
        fromUser: fromUser || "Черьбанк",
        toUser: toUser || "Пользователь",
        amount: parseInt(amount, 10) || 0,
        fee: parseInt(fee, 10) || 0,
        comment: comment || "",
        date: date || new Date().toLocaleString("ru-RU"),
      };

      await db.insert(transactions).values(newTx);
      return Response.json({ success: true, tx: newTx }, { headers: corsHeaders });
    }

    // 7. UPDATE SETTINGS
    if (path === "/settings" && method === "POST") {
      const newSettings = await req.json();

      await getOrCreateSettings();

      const [updated] = await db
        .update(bankSettings)
        .set({
          transferFeePercent: parseInt(newSettings.transferFeePercent, 10) || 3,
          loanRatePercent: parseInt(newSettings.loanRatePercent, 10) || 10,
          loanMaxAmount: parseInt(newSettings.loanMaxAmount, 10) || 50000,
          loanMaxTermDays: parseInt(newSettings.loanMaxTermDays, 10) || 7,
          loanPenaltyAmount: parseInt(newSettings.loanPenaltyAmount, 10) || 1000,
          depositRatePercent: parseInt(newSettings.depositRatePercent, 10) || 5,
          depositTermDays: parseInt(newSettings.depositTermDays, 10) || 3,
        })
        .where(eq(bankSettings.id, "default"))
        .returning();

      return Response.json({ success: true, settings: updated }, { headers: corsHeaders });
    }

    // 8. ADMIN: BALANCE ADJUSTMENT
    if (path === "/admin/balance" && method === "POST") {
      const { targetUsername, actionType, amount, reason } = await req.json();
      const numAmount = parseInt(amount, 10);

      const targetList = await db
        .select()
        .from(users)
        .where(ilike(users.username, targetUsername))
        .limit(1);

      if (targetList.length === 0) {
        return Response.json(
          { error: "Пользователь не найден" },
          { status: 404, headers: corsHeaders }
        );
      }

      const targetUser = targetList[0];
      let newBalance = targetUser.balance;

      if (actionType === "add") newBalance += numAmount;
      else if (actionType === "deduct") newBalance = Math.max(0, newBalance - numAmount);
      else if (actionType === "set") newBalance = Math.max(0, numAmount);

      await db
        .update(users)
        .set({ balance: newBalance })
        .where(eq(users.id, targetUser.id));

      const txComment = `[АДМИН-КОРРЕКЦИЯ (${actionType.toUpperCase()})] ${reason || "По решению администрации"}`;
      const txRecord = {
        id: "ADM-" + Math.floor(1000 + Math.random() * 9000),
        fromUser: "Черьбанк (Администрация)",
        toUser: targetUser.username,
        amount: numAmount,
        fee: 0,
        comment: txComment,
        date: new Date().toLocaleString("ru-RU"),
      };

      await db.insert(transactions).values(txRecord);

      return Response.json(
        { success: true, newBalance, tx: txRecord },
        { headers: corsHeaders }
      );
    }

    // 9. ADMIN: DELETE USER
    if (path === "/admin/delete-user" && method === "POST") {
      const { username } = await req.json();

      await db.delete(users).where(ilike(users.username, username));
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // 10. ADMIN: RESET ALL DATA
    if (path === "/admin/reset" && method === "POST") {
      await db.delete(transactions);
      await db.delete(users);
      await db.delete(bankSettings);
      await getOrCreateSettings();

      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // 11. SEED / IMPORT LOCAL USERS IF DATABASE IS FRESH
    if (path === "/seed" && method === "POST") {
      const { localUsers, localTx } = await req.json();

      const existingUsers = await db.select().from(users);
      if (existingUsers.length === 0 && Array.isArray(localUsers) && localUsers.length > 0) {
        for (const u of localUsers) {
          try {
            await db.insert(users).values({
              id: u.id || "USR-" + Math.floor(1000 + Math.random() * 9000),
              username: u.username,
              password: u.password,
              cardNumber: u.cardNumber || generateCardNumber(),
              balance: typeof u.balance === "number" ? u.balance : 1000,
              isFrozen: !!u.isFrozen,
              isAdmin: !!u.isAdmin,
              isVerified: !!u.isVerified,
              hasCherPlus: !!u.hasCherPlus,
              cardSkin: u.cardSkin || "default",
              bioUrl: u.bioUrl || "",
              activeLoan: u.activeLoan || null,
              activeDeposit: u.activeDeposit || null,
            });
          } catch (e) {
            console.error("Seed user error:", e);
          }
        }

        if (Array.isArray(localTx) && localTx.length > 0) {
          for (const t of localTx) {
            try {
              await db.insert(transactions).values({
                id: t.id || "TX-" + Math.floor(1000 + Math.random() * 9000),
                fromUser: t.from || "Черьбанк",
                toUser: t.to || "Пользователь",
                amount: typeof t.amount === "number" ? t.amount : 0,
                fee: typeof t.fee === "number" ? t.fee : 0,
                comment: t.comment || "",
                date: t.date || new Date().toLocaleString("ru-RU"),
              });
            } catch (e) {
              console.error("Seed tx error:", e);
            }
          }
        }
      }

      return Response.json({ success: true }, { headers: corsHeaders });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  } catch (err: any) {
    console.error("API error:", err);
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: "/api/*",
};
