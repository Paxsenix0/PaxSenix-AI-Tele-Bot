import { Bot, webhookCallback, InputFile } from "https://deno.land/x/grammy/mod.ts";

interface Subscribers {
    subscribe: boolean;
    id: string;
}

const token = Deno.env.get("TELEGRAM_BOT_TOKEN") || 'Your Bot Token';
const bot = new Bot(token);

bot.command("start", (ctx) => ctx.reply("Hello! Send /subscribe to start chat with me!", {
  reply_parameters: {
    message_id: ctx.msg.message_id
  }
}));

bot.command("subscribe", async (ctx) => {
  const id = ctx.from.id;
  const kv = await Deno.openKv();
  const subscribe = await kv.get(["data", id]);
  if(subscribe?.value?.subscribe != null) {
    ctx.reply("Sorry, but you already subscribed to me", {
      reply_parameters: {
        message_id: ctx.msg.message_id
      }
    });
  } else {
    const scheme: Subscribers = { 
      subscribe: true,
      id: id 
    };
    await kv.set(["data", id], scheme);
    ctx.reply("Subscribed to the bot", {
      reply_parameters: {
        message_id: ctx.msg.message_id
      }
    });
  }
});

bot.command("clear", async (ctx) => {
  const id = ctx.from.id;
  const kv = await Deno.openKv();
  await kv.delete(["chats", id]);
  ctx.reply("Your conversation has been cleared up!", {
    reply_parameters: {
      message_id: ctx.msg.message_id
    }
  });
});

bot.command("help", async (ctx) => {
  ctx.reply("**PaxSenixAI Help**\n\nHi! I'm here to help you with anything you need. Here are some examples of things you can ask me or talk to me about:\n\n\n**Converse**: Just chat with me like you would with a friend! Ask me about your day, your interests, or anything on your mind.\n\n**Ask Questions**: Got a question about something? I'll do my best to provide a helpful answer. It can be about science, history, entertainment, or anything else!\n\n**Generate Text**: Need help with writing something? I can generate text on a topic of your choice, like a story, poem, or even a joke!\n\n**Play Games**: We can play simple text-based games like Hangman, 20 Questions, or Word Chain.\n\n**Learn Something New**: Want to learn a new skill or topic? I can provide explanations, examples, and resources to help you get started.\n\n**Just for Fun**: If you need a break or a pick-me-up, I can share some fun facts, jokes, or inspiring quotes with you!\n\nWhat would you like to do? Start Interact with me by send /subscribe", {
    reply_parameters: {
      message_id: ctx.msg.message_id
    },
    parse_mode: 'MarkdownV2'
  });
});

bot.command("unsubscribe", async (ctx) => {
  const id = ctx.from.id;
  const kv = await Deno.openKv();
  await kv.delete(["data", id]);
  await kv.delete(["chats", id]);
  await kv.delete(["prompt", id]);
  ctx.reply("Unsubscribed from the bot", {
    reply_parameters: {
      message_id: ctx.msg.message_id
    }
  });
});

bot.on("message:text", async (ctx) => {
   try {
    const kv = await Deno.openKv();
    let id = ctx.from.id;
    const subscribe = await kv.get(["data", id]);
    if(subscribe.value.subscribe) {
      try {
        let messageItems = [];
        try {
          const storedMessages = await kv.get(["chats", id]);
          if (storedMessages && Array.isArray(storedMessages.value)) {
             messageItems = storedMessages.value;
          } else {
            const storedPrompt = await kv.get(["prompt", id]);
            if(storedPrompt.value) {
              messageItems.push({
                'role': 'system',
                'content': storedPrompt.value
              });
            }
          }
        } catch (err) {
          console.error(err);
        }
          messageItems.push({
           'role': 'user',
           'content': ctx.msg.text
          });
        const requestBody = {
          'model': 'meta-llama\/Meta-Llama-3-70B-Instruct',
          'max_tokens': 300,
          'temperature': 0.9,
          'messages': messageItems
        };
        ctx.replyWithChatAction('typing');
        const response = await fetch(`https://paxsenix-ai.onrender.com/v1/chat/completions`, {
           headers: { 
             'Authorization': `Bearer ${Deno.env.get("APIKEY")}`,
             'Content-Type': 'application/json'
           },
           method: 'POST',
           body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        const text = data.choices[0].message.content;
        messageItems.push({
           'role': 'assistant',
           'content': text
        });
        try { 
          await kv.set(["chats", id], messageItems);
          ctx.reply(text, {
           reply_parameters: {
             message_id: ctx.msg.message_id,
           } 
          });
        } catch(error) {
          console.error(error);
        }
      } catch (error) {
        ctx.reply("Sorry, couldn't fetch the data.");
        console.error(error);
      }
    }
  } catch(error) {
    console.error(error);
  }
});

const handleUpdate = webhookCallback(bot, "std/http");

Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === bot.token) {
      try {
        return await handleUpdate(req);
      } catch (err) {
        console.error(err);
      }
    }
  }
  return new Response();
});