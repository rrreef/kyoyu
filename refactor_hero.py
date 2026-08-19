import sys

def refactor():
    with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", "r") as f:
        content = f.read()

    main_idx = content.find("private func mainContent() -> some View {")
    hero_idx = content.find("HStack(alignment: .top, spacing: 15) {", main_idx)
    
    # find the matching closing bracket for Hero HStack
    count = 0
    end_hero = -1
    for i in range(hero_idx, len(content)):
        if content[i] == '{':
            count += 1
        elif content[i] == '}':
            count -= 1
            if count == 0:
                end_hero = i
                break
                
    hero_content = content[hero_idx:end_hero+1]
    
    # replace it in mainContent
    new_content = content[:hero_idx] + "heroSection()" + content[end_hero+1:]
    
    # insert the new function
    struct_end = new_content.find("private func plainText")
    
    func_def = f"""
    @ViewBuilder
    private func heroSection() -> some View {{
{hero_content}
    }}
"""
    new_content = new_content[:struct_end] + func_def + "\n    " + new_content[struct_end:]
    
    with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", "w") as f:
        f.write(new_content)
    print("Extracted heroSection!")

refactor()
