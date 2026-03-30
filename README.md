<div align='center'>
    <h1>mctk</h1>
    <h3>minecraft cookie/token toolkit for various purposes</h3>
</div>

<br><br>
<h2 align='center'>initial setup</h2>

1. install [bun](https://bun.sh)
2. `git clone https://github.com/VillainsRule/mctk && cd mctk`
3. `cp .env.example .env` & fill in values
4. `bun install`

<br><br>
<h2 align='center'>banchecking accesstokens</h2>

1. put a ton of tokens in ./input.txt (one per line)
2. `bun checktok`
3. see ./output.txt for unbans

> [!NOTE]
> this is meant for ~100 tokens at once (for example drops in servers), NOT giant dumps (500+) and should not be relied on for such

<br><br>
<h2 align='center'>converting cookie -> token</h2>

1. `bun c2t`
2. enter the cookie and click enter
3. view accesstoken in terminal

<br><br>
<h5 align='center'>made with :heart:</h5>
