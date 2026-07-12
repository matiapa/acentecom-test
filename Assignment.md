**Test Assignment — AI Developer**

**BUILD A SMALL WORKING SYSTEM WITH CLAUDE CODE**

*Shopify  \+  Supabase  \+  Claude Code — skills & agents*

**1   Scenario**

We run an online store on [Shopify](https://www.shopify.com) and keep our data in [Supabase](https://supabase.com). We want all our work to run through [Claude Code](https://www.claude.com/product/claude-code) — built as **skills and agents**.

**Your task:** build one small but **fully working assistant** that goes through the whole path — **pull the data, store it, answer questions, produce a report.**

| Read this first:  This is not a single simple function. It's a small system made of several parts. We specifically want to see how you connect services together and take things all the way to a finished result. |
| :---- |

**2   Setup — Create Your Own Environment**

Set up the whole environment **yourself** — both services are **free for testing**, no payment and no card needed.

* **Shopify:** create a free [development store](https://www.shopify.com/partners) via Shopify. Add a few sample products and orders.  
* **Supabase:** create a free project. The free tier is more than enough for this task.  
* **Claude Code:** build everything as proper Claude Code skills and agents.

**3   What To Build**

**Part 1 — Pull data from Shopify.** Connect to your store, pull products and orders, and **clean the data** into a clear shape.

**Part 2 — Store it in Supabase.** Create the needed tables and write the data in. Running it again should **update, not duplicate**.

**Part 3 — An agent that answers questions.** It reads the database and answers in plain language — e.g. **“how many orders this week”**. It must **never invent numbers**; answers come only from the database.

**Part 4 — Daily report.** A skill that builds a short daily report — **new orders, revenue, new products** — in a simple, readable form.

**Part 5 — Ship it as real skills/agents.** Each one needs a **clear description of when it triggers**. Not just a script that runs, but a finished tool a non-technical teammate can use.

**4   What We'll Evaluate**

| Area | What good looks like |
| :---- | :---- |
| **Connected system** | Shopify, Supabase and Claude Code work as one flow. |
| **Quality of skills/agents** | Clear descriptions, obvious when to trigger, easy to use. |
| **Security** | Keys and passwords are not hardcoded — handled properly. |
| **No hallucinated numbers** | The agent pulls only from the database, never makes things up. |
| **Finished, not 'almost'** | It actually works end to end. |
| **How you think** | You can walk us through why you made each choice. |

**5   Conditions**

1. **Deadline:** 2–3 days from start  
2. Create the Shopify store and Supabase project yourself — both are free.  
3. If something is missing, ask questions — that's a plus, not a minus.  
4. At the end: a short call where you show it working and explain your reasoning.

**Note:**  Never hardcode keys into the code. Use environment variables / a config file that isn't committed.